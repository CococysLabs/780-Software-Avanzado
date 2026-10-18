import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product) // Use the 'producto' connection
    private readonly productoRepository: Repository<Product>,
  ) { }

  create(createProductDto: CreateProductDto) {
    const newProduct = this.productoRepository.create(createProductDto);
    return this.productoRepository.save(newProduct);
  }

  findAll() {
    return this.productoRepository.find();
  }


}
