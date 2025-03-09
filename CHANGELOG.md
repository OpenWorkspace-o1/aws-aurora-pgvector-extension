## 2025-03-09 [PR#19](https://github.com/OpenWorkspace-o1/aws-aurora-pgvector-extension-creator/pull/19)

### Updated
- Upgraded `esbuild` from `0.24.2` to `0.25.0` in `api-key-authorizer` lambda.
- Updated `@aws-lambda-powertools/logger` from `^2.13.1` to `^2.16.0` and `@aws-sdk/client-secrets-manager` from `^3.738.0` to `^3.758.0`.
- Bumped `uuid` dependency from `^11.0.5` to `^11.1.0`.
- Incremented `api-key-authorizer-lambda` version from `0.0.2` to `0.0.3`.

## 2025-03-09 [PR#17](https://github.com/OpenWorkspace-o1/aws-aurora-pgvector-extension-creator/pull/17)

### Updated
- Upgraded `aws-cdk` to `2.1003.0`, `aws-cdk-lib` to `2.182.0`, `@types/node` to `22.13.10`, `esbuild` to `0.25.0`, `ts-jest` to `29.2.6`, and `typescript` to `5.8.2`.
- Updated `README.md` environment variables to use placeholders for `RDS_USERNAME` and `RDS_DATABASE_NAME`, and adjusted `APP_NAME` and `CDK_DEPLOY_REGION`.
- Bumped package version to `0.1.5`.

## 2025-02-04 [PR#13](https://github.com/OpenWorkspace-o1/aws-aurora-pgvector-extension-creator/pull/13)

### Changed
Enhanced documentation for `_create_vector_extension` and `handler` functions, including details on transactional safety, advisory locks, and error handling.

### Updated
Bumped `@types/node` from `22.12.0` to `22.13.1` and updated `cdk-nag` from `2.35.5` to `2.35.9`. Incremented package version from `0.1.2` to `0.1.3`.