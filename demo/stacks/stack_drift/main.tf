resource "aws_s3_object" "obj1" {
  bucket = "tfstate"
  key    = "stack_drift/drifting"

  content = "foobar"

  tags = {
    test = "value_from_tf"
  }
}

resource "aws_s3_object" "obj2" {
  bucket = "tfstate"
  key    = "stack_drift/test_dep"

  # refer to the content of the S3 object, so it will be displayed in drift
  content = aws_s3_object.obj1.tags["test"]
}
