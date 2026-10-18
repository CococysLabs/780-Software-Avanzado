
import 'dotenv/config';
import *  as joi from 'joi';


interface EnvVars {
    PORT: number;

    NATS_SERVERS: string[];

    JWT_SECRET: string;
}

const envsSchema = joi.object({
    PORT: joi.number().required(),
    NATS_SERVERS: joi.array().items(joi.string()).required(),
    JWT_SECRET: joi.string().required(),
})
    .unknown(true);

const { error, value } = envsSchema.validate({
    ...process.env,
    NATS_SERVERS: process.env.NATS_SERVERS ? process.env.NATS_SERVERS.split(',') : [],
});

if (error) {
    throw new Error(`Config validation error': ${error.message}`);
}

const EnvVars: EnvVars = value;

export const envs = {
    port: EnvVars.PORT,
    natsServers: EnvVars.NATS_SERVERS,
    jwtSecret: EnvVars.JWT_SECRET,
}