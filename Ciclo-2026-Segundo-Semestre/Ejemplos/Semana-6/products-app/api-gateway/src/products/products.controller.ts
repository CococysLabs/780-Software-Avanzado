import { Body, Controller, Get, Inject, Injectable, Post } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateProductDto } from 'src/common/create-product.dto';
import { NATS_SERVICE, PRODUCT_SERVICE } from 'src/config';


@Controller('products')
export class ProductsController {

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) { }

  @Post()
  createProduct(@Body() createProductDto: CreateProductDto) {
    return this.client.send({ cmd: 'create_product' }, createProductDto);
  }

  @Get()
  findAllProduct() {
    return this.client.send({ cmd: 'find_all' }, { });
  }
}
