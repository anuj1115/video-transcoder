import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { S3Event } from "aws-lambda";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

const client = new SQSClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID as string,
        secretAccessKey: process.env.SECRET_ACCESS_KEY as string,
    }, 
});

const ecsClient = new ECSClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID as string,
        secretAccessKey: process.env.SECRET_ACCESS_KEY as string,
    }, 
})


async function init() {
    const command = new ReceiveMessageCommand({
        QueueUrl: process.env.QUEUE_URL as string,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
    })

    while(true) {
        const {Messages} = await client.send(command)
        if(!Messages) {
            console.log(`No message in queue`);
            continue;
        }

        try {
            for(const message of Messages) {
                const {MessageId, Body} = message
                console.log(`Message Received`, {MessageId, Body});
                if(!Body) continue
                
                // validate the event
                const event = JSON.parse(Body) as S3Event

                if("Service" in event && "Event" in event) {
                    if(event.Event === "s3:TestEvent") {
                        await client.send(new DeleteMessageCommand({
                            QueueUrl: process.env.QUEUE_URL as string,
                            ReceiptHandle: message.ReceiptHandle,
                        }))
                        continue
                    } 
                }
    
                // spin the docker container

                for(const record of event.Records) {
                    const {s3} = record
                    const {bucket, object: {key}} = s3


                    const runTaskCommand = new RunTaskCommand({
                        taskDefinition: process.env.TASK_ARN as string,
                        cluster: process.env.CLUSTER_ARN as string,
                        launchType: 'FARGATE',
                        networkConfiguration: {
                            awsvpcConfiguration: {
                                assignPublicIp: 'ENABLED',
                                securityGroups:['sg-025d2310f45497c47'],
                                subnets: ['subnet-0755d37176067c321', 'subnet-0eb9b99b08d8db7fd', 'subnet-024897b3921720728']
                            },
                        },
                        overrides: {
                            containerOverrides:[{name: 'video-transcoder-1', environment: [{name: 'BUCKET_NAME', value: bucket.name}, {name: 'KEY', value: key},]}]
                        }
                    })
                    await ecsClient.send(runTaskCommand)
                    
                }
    
                // Delete the message from queue
                await client.send(new DeleteMessageCommand({
                    QueueUrl: process.env.QUEUE_URL as string,
                    ReceiptHandle: message.ReceiptHandle,
                }))
            }
        } catch (error) {
            console.log(error);
            
        }
    }
}


init()