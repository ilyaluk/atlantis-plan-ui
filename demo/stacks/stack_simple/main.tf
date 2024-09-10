resource "aws_s3_object" "to_be_updated" {
  bucket = "tfstate"
  key    = "stack_simple/upd"

  content = "old"
}

resource "aws_s3_object" "to_be_deleted" {
  bucket = "tfstate"
  key    = "stack_simple/del"

  content = "old"
}

resource "aws_s3_object" "to_be_moved" {
  bucket = "tfstate"
  key    = "stack_simple/upd"

  content = "old"
}

resource "null_resource" "to_be_recreated" {
  triggers = {
    value = "1"
  }
}

resource "null_resource" "to_be_recreated_cbd" {
  triggers = {
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }
}
