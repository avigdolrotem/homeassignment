const { Kafka } = require('kafkajs');
const log4js = require('log4js');

log4js.configure({
  appenders: {
    console: { type: 'console' }
  },
  categories: {
    default: { appenders: ['console'], level: 'info' }
  }
});

const logger = log4js.getLogger();

const kafka = new Kafka({
  clientId: 'cdc-consumer',
  brokers: [process.env.KAFKA_BROKER || 'kafka:29092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const consumer = kafka.consumer({ groupId: 'cdc-consumer-group' });

async function run() {
  await consumer.connect();
  console.log('Connected to Kafka');

  await consumer.subscribe({ 
    topic: process.env.KAFKA_TOPIC || 'tidb-cdc',
    fromBeginning: true 
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const value = message.value.toString();
        const cdcEvent = JSON.parse(value);

        const logEntry = {
          timestamp: new Date().toISOString(),
          topic: topic,
          partition: partition,
          operation: cdcEvent.type || 'unknown',
          table: cdcEvent.table || 'unknown',
          data: cdcEvent.data || cdcEvent
        };

        logger.info(JSON.stringify(logEntry));
      } catch (error) {
        console.error('Error processing message:', error);
      }
    },
  });
}

run().catch(console.error);
