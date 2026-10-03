@echo off
setlocal
REM (Re)create the `iphotos` IAM user, its bucket-scoped policy and a fresh access key.
REM
REM backend/.env authenticates to S3 as this user; it needs no console access. IAM
REM management requires admin credentials, so run this from an ADMIN cmd window
REM (root account, an admin profile or CloudShell).
REM
REM Optional environment overrides:
REM   set USER_NAME=iphotos        IAM user name            (default: iphotos)
REM   set BUCKET=iphotos-fotos     bucket the policy scopes (default: iphotos-fotos)
REM   set MGMT=1                   also grant s3:CreateBucket/DeleteBucket/etc. so this
REM                                user can run the region-move script (revoke after)
REM   set UPDATE_CLI=1             also write the key into %%USERPROFILE%%\.aws\credentials [default]
REM
REM After running: check IPHOTOS_S3_REGION in backend\.env matches the bucket region,
REM then: docker compose up -d storage

set "USER_NAME_=%USER_NAME%"
if "%USER_NAME_%"=="" set "USER_NAME_=iphotos"
set "BUCKET_=%BUCKET%"
if "%BUCKET_%"=="" set "BUCKET_=iphotos-fotos"
set "MGMT_=%MGMT%"
if "%MGMT_%"=="" set "MGMT_=0"
set "UPDATE_CLI_=%UPDATE_CLI%"
if "%UPDATE_CLI_%"=="" set "UPDATE_CLI_=0"
set "BACKEND_DIR=%~dp0.."
set "ENV_FILE=%BACKEND_DIR%\.env"
set "POLICY_FILE=%TEMP%\iphotos-s3-policy.json"

where aws >nul 2>nul
if errorlevel 1 (
  echo aws CLI not found in PATH
  exit /b 1
)

echo == building policy for bucket %BUCKET_%
>%POLICY_FILE% echo {
>>%POLICY_FILE% echo   "Version": "2012-10-17",
>>%POLICY_FILE% echo   "Statement": [
>>%POLICY_FILE% echo     {
>>%POLICY_FILE% echo       "Sid": "BucketList",
>>%POLICY_FILE% echo       "Effect": "Allow",
>>%POLICY_FILE% echo       "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
>>%POLICY_FILE% echo       "Resource": "arn:aws:s3:::%BUCKET_%"
>>%POLICY_FILE% echo     },
>>%POLICY_FILE% echo     {
>>%POLICY_FILE% echo       "Sid": "ObjectReadWrite",
>>%POLICY_FILE% echo       "Effect": "Allow",
>>%POLICY_FILE% echo       "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
>>%POLICY_FILE% echo       "Resource": "arn:aws:s3:::%BUCKET_%/*"
>>%POLICY_FILE% echo     }
if "%MGMT_%"=="1" (
  >>%POLICY_FILE% echo     ,
  >>%POLICY_FILE% echo     {
  >>%POLICY_FILE% echo       "Sid": "BucketManagement",
  >>%POLICY_FILE% echo       "Effect": "Allow",
  >>%POLICY_FILE% echo       "Action": ["s3:CreateBucket", "s3:DeleteBucket", "s3:PutBucketPublicAccessBlock", "s3:ListAllMyBuckets"],
  >>%POLICY_FILE% echo       "Resource": "*"
  >>%POLICY_FILE% echo     }
)
>>%POLICY_FILE% echo     ,
>>%POLICY_FILE% echo     {
>>%POLICY_FILE% echo       "Sid": "DenyInsecureTransport",
>>%POLICY_FILE% echo       "Effect": "Deny",
>>%POLICY_FILE% echo       "Action": "s3:*",
>>%POLICY_FILE% echo       "Resource": ["arn:aws:s3:::%BUCKET_%", "arn:aws:s3:::%BUCKET_%/*"],
>>%POLICY_FILE% echo       "Condition": { "Bool": { "aws:SecureTransport": "false" } }
>>%POLICY_FILE% echo     }
>>%POLICY_FILE% echo   ]
>>%POLICY_FILE% echo }

echo == creating user '%USER_NAME_%' ^(ignored if it already exists^)
REM 'call' keeps control even if aws resolves to a .cmd shim instead of aws.exe.
call aws iam create-user --user-name "%USER_NAME_%" >nul 2>&1 || echo    user already exists - keeping it

echo == putting inline policy 'iphotos-s3' ^(mgmt=%MGMT_%^)
call aws iam put-user-policy --user-name "%USER_NAME_%" --policy-name iphotos-s3 --policy-document "file://%POLICY_FILE%"
if errorlevel 1 exit /b 1

echo == creating a new access key
set "ACCESS_KEY="
set "SECRET_KEY="
for /f "usebackq tokens=1,2" %%A in (`aws iam create-access-key --user-name "%USER_NAME_%" --query "[AccessKey.AccessKeyId,AccessKey.SecretAccessKey]" --output text`) do (
  set "ACCESS_KEY=%%A"
  set "SECRET_KEY=%%B"
)
if "%ACCESS_KEY%"=="" (
  echo failed to create access key
  exit /b 1
)

if exist "%ENV_FILE%" (
  powershell -NoProfile -Command "(Get-Content -LiteralPath '%ENV_FILE%') -replace '^IPHOTOS_S3_ACCESS_KEY=.*', 'IPHOTOS_S3_ACCESS_KEY=%ACCESS_KEY%' -replace '^IPHOTOS_S3_SECRET_KEY=.*', 'IPHOTOS_S3_SECRET_KEY=%SECRET_KEY%' | Set-Content -LiteralPath '%ENV_FILE%'"
  echo == %ENV_FILE% updated with the new key
) else (
  echo == %ENV_FILE% not found - key NOT written anywhere persistent:
)
echo    ACCESS_KEY_ID:     %ACCESS_KEY%
echo    SECRET_ACCESS_KEY: %SECRET_KEY%
echo    ^(shown once - store it safely^)

echo == deleting older access keys
for /f "usebackq tokens=*" %%L in (`aws iam list-access-keys --user-name "%USER_NAME_%" --query "AccessKeyMetadata[].AccessKeyId" --output text`) do (
  for %%K in (%%L) do (
    if not "%%K"=="%ACCESS_KEY%" (
      echo    deleting %%K
      call aws iam delete-access-key --user-name "%USER_NAME_%" --access-key-id %%K
    )
  )
)

if "%UPDATE_CLI_%"=="1" (
  call aws configure set aws_access_key_id %ACCESS_KEY% --profile default
  call aws configure set aws_secret_access_key %SECRET_KEY% --profile default
  echo == %%USERPROFILE%%\.aws\credentials [default] updated with the new key
)

echo.
echo Done. Next steps:
echo   1. Confirm the bucket region:  aws s3api get-bucket-location --bucket %BUCKET_%
echo   2. Set IPHOTOS_S3_REGION in backend\.env to that region
echo   3. docker compose up -d storage
endlocal
