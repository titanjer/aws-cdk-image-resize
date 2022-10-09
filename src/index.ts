import { Duration, Stack } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { DistributionProps } from './types';

export interface IImageResizeFunctionProps {
  originResponseLambdaProps?: NodejsFunctionProps;
  viewerRequestLambdaProps?: NodejsFunctionProps;
}

export class ImageResizeFunction extends Construct {
  edgeLambdaRole: iam.Role;
  imageViewerRequestLambda: NodejsFunction;
  imageOriginResponseLambda: NodejsFunction;

  constructor(scope: Construct, id: string, props?: IImageResizeFunctionProps) {
    super(scope, id);

    if (Stack.of(this).region !== 'us-east-1') {throw new Error('Only support in us-east-1');}

    const { originResponseLambdaProps, viewerRequestLambdaProps } = props || {};

    const managedPolicyArn = iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );
    this.edgeLambdaRole = new iam.Role(this, 'EdgeLambdaRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ServicePrincipal('edgelambda.amazonaws.com'),
      ),
      managedPolicies: [managedPolicyArn],
    });

    this.imageOriginResponseLambda = new NodejsFunction(this, 'OriginResponseFunction', {
      bundling: {
        minify: true,
        nodeModules: ['sharp'],
      },
      entry: `${__dirname}/../lambda/image-origin-response-function/index.js`,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_16_X,
      timeout: Duration.seconds(15),
      role: this.edgeLambdaRole,
      awsSdkConnectionReuse: false,
      memorySize: 2048,
      ...originResponseLambdaProps,
    });

    this.imageViewerRequestLambda = new NodejsFunction(this, 'ViewerRequestFunction', {
      entry: `${__dirname}/../lambda/image-viewer-request-function/index.js`,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_16_X,
      role: this.edgeLambdaRole,
      ...viewerRequestLambdaProps,
    });
  }
}

export interface IImageResizeProps {
  s3BucketProps?: s3.BucketProps;
  cloudfrontDistributionProps?: DistributionProps;
  originResponseLambdaVersionArn: string;
  originResponseLambdaRoleArn: string;
  viewerRequestLambdaVersionArn: string;
}

export class ImageResize extends Construct {
  distribution: cloudfront.Distribution;
  imagesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: IImageResizeProps) {
    super(scope, id);

    const {
      s3BucketProps,
      cloudfrontDistributionProps,
      originResponseLambdaVersionArn,
      originResponseLambdaRoleArn,
      viewerRequestLambdaVersionArn,
    } = props;

    this.imagesBucket = new s3.Bucket(this, 'Bucket', s3BucketProps);
    this.imagesBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [this.imagesBucket.bucketArn, this.imagesBucket.arnForObjects('*')],
        actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
        principals: [new iam.ArnPrincipal(originResponseLambdaRoleArn)],
      }),
    );
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI');
    this.imagesBucket.grantRead(originAccessIdentity);

    const cachePolicy =
      cloudfrontDistributionProps?.defaultBehavior?.cachePolicy ??
      new cloudfront.CachePolicy(this, 'CachePolicy', {
        defaultTtl: Duration.days(365), // 1 year
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
        maxTtl: Duration.days(365 * 2), // 2 years
        minTtl: Duration.days(30 * 3), // 3 months
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('height', 'width'),
      });

    // Cloudfront distribution for the S3 bucket.
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      ...cloudfrontDistributionProps,
      defaultBehavior: {
        origin: new origins.S3Origin(this.imagesBucket, { originAccessIdentity }),
        cachePolicy,
        edgeLambdas: [
          {
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
            functionVersion: lambda.Version.fromVersionArn(
              this,
              'originResponseLambdaVersionArn',
              originResponseLambdaVersionArn,
            ),
          },
          {
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
            functionVersion: lambda.Version.fromVersionArn(
              this,
              'viewerRequestLambdaVersionArn',
              viewerRequestLambdaVersionArn,
            ),
          },
        ],
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        ...cloudfrontDistributionProps?.defaultBehavior,
      },
    });

    this.distribution.addBehavior;
  }
}
