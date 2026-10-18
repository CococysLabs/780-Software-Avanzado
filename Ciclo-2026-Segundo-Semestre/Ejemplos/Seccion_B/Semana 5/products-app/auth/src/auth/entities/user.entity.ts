import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('user')
export class User {


    @PrimaryGeneratedColumn('uuid')
    id: number;

    @Column('text',
        {
            unique: true,
        }
    )
    name: string;

    @Column('text', {
        unique: true,
    })
    email: string;

    @Column('text')
    password: string;


}
