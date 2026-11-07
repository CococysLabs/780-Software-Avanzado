import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('product')
export class Product {


    @PrimaryGeneratedColumn('uuid')
    id: number;

    @Column('text',
        {
            unique: true,
        }
    )
    name: string;

    @Column('float', {
        default: 0
    })
    price: number;

}
