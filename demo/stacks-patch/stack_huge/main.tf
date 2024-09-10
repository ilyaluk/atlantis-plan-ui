resource "aws_s3_object" "to_be_updated" {
  count = 50

  bucket = "tfstate"
  key    = "stack_huge/upd_${count.index}"

  content = "new"
}

resource "aws_s3_object" "to_be_created" {
  count = 40

  bucket = "tfstate"
  key    = "stack_huge/creat_${count.index}"

  content = "new"
}
