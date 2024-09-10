resource "aws_s3_object" "to_be_updated" {
  bucket = "tfstate"
  key    = "stack_simple/upd"

  content = "new"
}

resource "aws_s3_object" "to_be_created" {
  bucket = "tfstate"
  key    = "stack_simple/creat"

  content = "new"
}

resource "aws_s3_object" "to_be_moved_new" {
  bucket = "tfstate"
  key    = "stack_simple/upd"

  content = "old"
}

moved {
  from = aws_s3_object.to_be_moved
  to   = aws_s3_object.to_be_moved_new
}

resource "null_resource" "to_be_recreated" {
  triggers = {
    value = "2"
  }
}

resource "null_resource" "to_be_recreated_cbd" {
  triggers = {
    value = "2"
  }

  lifecycle {
    create_before_destroy = true
  }
}
