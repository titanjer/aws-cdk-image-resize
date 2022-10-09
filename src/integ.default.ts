import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { ImageResizeFunction, ImageResize } from './index';

const app = new App();
const stack = new Stack(app, 'ImageResizeStack', { env: { region: 'us-east-1' } });

const func = new ImageResizeFunction(stack, 'ImageResizeFunction');

const props = {
  originResponseLambdaRoleArn: func.edgeLambdaRole.roleArn,
  originResponseLambdaVersionArn: func.imageOriginResponseLambda.currentVersion.functionArn,
  viewerRequestLambdaVersionArn: func.imageViewerRequestLambda.currentVersion.functionArn,
  s3BucketProps: {
    autoDeleteObjects: true,
    bucketName: 'image-resize-lib-test',
    removalPolicy: RemovalPolicy.DESTROY,
  },
  cloudfrontDistributionProps: {
    errorResponses: [{ httpStatus: 404, responsePagePath: '/path/to/default/object' }],
  },
};

new ImageResize(stack, 'ImageResizeLib', props);
