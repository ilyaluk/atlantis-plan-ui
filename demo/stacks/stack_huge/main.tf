resource "aws_s3_object" "to_be_updated" {
  count = 50

  bucket = "tfstate"
  key    = "stack_huge/upd_${count.index}"

  content = "old"
}

resource "aws_s3_object" "to_be_deleted" {
  count = 30

  bucket = "tfstate"
  key    = "stack_huge/del_${count.index}"

  content = "old"
}
