# AWS IAM Policies for Remotion Lambda

Copy-paste these into the AWS Console when creating the IAM policy and user inline policy.

## 1. Role Policy (for `remotion-lambda-policy`)

Paste this into: IAM → Policies → Create policy → JSON tab

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "0",
      "Effect": "Allow",
      "Action": ["s3:ListAllMyBuckets"],
      "Resource": ["*"]
    },
    {
      "Sid": "1",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:PutBucketAcl",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObjectAcl",
        "s3:PutObject",
        "s3:GetBucketLocation"
      ],
      "Resource": ["arn:aws:s3:::remotionlambda-*"]
    },
    {
      "Sid": "2",
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": ["arn:aws:lambda:*:*:function:remotion-render-*"]
    },
    {
      "Sid": "3",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup"],
      "Resource": ["arn:aws:logs:*:*:log-group:/aws/lambda-insights"]
    },
    {
      "Sid": "4",
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": [
        "arn:aws:logs:*:*:log-group:/aws/lambda/remotion-render-*",
        "arn:aws:logs:*:*:log-group:/aws/lambda-insights:*"
      ]
    }
  ]
}
```

Name it **exactly**: `remotion-lambda-policy`

---

## 2. User Policy (inline policy for `remotion-user`)

Paste this into: IAM → Users → remotion-user → Add inline policy → JSON tab

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HandleQuotas",
      "Effect": "Allow",
      "Action": [
        "servicequotas:GetServiceQuota",
        "servicequotas:GetAWSDefaultServiceQuota",
        "servicequotas:RequestServiceQuotaIncrease",
        "servicequotas:ListRequestedServiceQuotaChangeHistoryByQuota"
      ],
      "Resource": ["*"]
    },
    {
      "Sid": "PermissionValidation",
      "Effect": "Allow",
      "Action": ["iam:SimulatePrincipalPolicy"],
      "Resource": ["*"]
    },
    {
      "Sid": "LambdaInvokation",
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": ["arn:aws:iam::*:role/remotion-lambda-role"]
    },
    {
      "Sid": "Storage",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObjectAcl",
        "s3:PutObject",
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:PutBucketAcl",
        "s3:DeleteBucket",
        "s3:PutBucketOwnershipControls",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutBucketPolicy",
        "s3:PutLifecycleConfiguration"
      ],
      "Resource": ["arn:aws:s3:::remotionlambda-*"]
    },
    {
      "Sid": "BucketListing",
      "Effect": "Allow",
      "Action": ["s3:ListAllMyBuckets"],
      "Resource": ["*"]
    },
    {
      "Sid": "FunctionListing",
      "Effect": "Allow",
      "Action": ["lambda:ListFunctions", "lambda:GetFunction"],
      "Resource": ["*"]
    },
    {
      "Sid": "FunctionManagement",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeAsync",
        "lambda:InvokeFunction",
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:PutFunctionEventInvokeConfig",
        "lambda:PutRuntimeManagementConfig",
        "lambda:TagResource"
      ],
      "Resource": ["arn:aws:lambda:*:*:function:remotion-render-*"]
    },
    {
      "Sid": "LogsRetention",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:PutRetentionPolicy"],
      "Resource": ["arn:aws:logs:*:*:log-group:/aws/lambda/remotion-render-*"]
    },
    {
      "Sid": "FetchBinaries",
      "Effect": "Allow",
      "Action": ["lambda:GetLayerVersion"],
      "Resource": [
        "arn:aws:lambda:*:678892195805:layer:remotion-binaries-*",
        "arn:aws:lambda:*:580247275435:layer:LambdaInsightsExtension*"
      ]
    }
  ]
}
```

Name it: `remotion-user-policy` (any name works)

---

## Setup Order

1. **Create policy** `remotion-lambda-policy` (use JSON #1 above)
2. **Create role** `remotion-lambda-role` (Lambda use case, attach `remotion-lambda-policy`)
3. **Create user** `remotion-user` (no console access)
4. **Create access key** for `remotion-user` (copy Access Key ID + Secret)
5. **Add inline policy** to `remotion-user` (use JSON #2 above)
6. **Paste credentials to me** — I'll configure the CLI and run the render
