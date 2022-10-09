import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ImageResize, ImageResizeFunction } from '../src';

test('Image resize', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', { env: { region: 'us-east-1' } });

  // WHEN
  const func = new ImageResizeFunction(stack, 'ImageResizeFunction');
  const props = {
    originResponseLambdaRoleArn: func.edgeLambdaRole.roleArn,
    originResponseLambdaVersionArn: func.imageOriginResponseLambda.currentVersion.functionArn,
    viewerRequestLambdaVersionArn: func.imageViewerRequestLambda.currentVersion.functionArn,
  };
  new ImageResize(stack, 'ImageResize', props);

  // THEN
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::Lambda::Function', 2);
  template.resourceCountIs('AWS::S3::Bucket', 1);
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
});
