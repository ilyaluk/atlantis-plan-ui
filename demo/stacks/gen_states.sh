#!/usr/bin/env bash

for folder in $(find . -type d -depth 1); do
  folder_name=$(basename "$folder")
  cat > "$folder/providers.tf" <<EOF
terraform {
  backend "s3" {
    bucket = "tfstate"
    key    = "$folder_name"

    access_key = "minioadmin"
    secret_key = "minioadmin"

    endpoints = {
      s3 = "http://localhost:9000"
    }

    region                      = "main"
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    use_path_style              = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region     = "main"
  access_key = "minioadmin"
  secret_key = "minioadmin"

  s3_use_path_style = true
  endpoints {
    s3 = "http://localhost:9000"
  }

  skip_region_validation      = true
  skip_credentials_validation = true
  skip_requesting_account_id  = true
}
EOF
done
