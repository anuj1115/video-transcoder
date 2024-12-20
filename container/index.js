const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const fs = require('node:fs/promises')
const path = require('node:path')
const ffmpeg = require("fluent-ffmpeg") 

const RESOLUTIONS = [
    { name: "360p", width: 480, height: 360 },
    { name: "480p", width: 858, height: 480 },
    { name: "720p", width: 1280, height: 720 },
]

const s3Client = new S3Client({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    },
})

const BUCKET_NAME = process.env.BUCKET_NAME
const KEY = process.env.KEY

async function init() {
    try {
        // Download the original video
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: KEY // Fixed key name
        })

        const result = await s3Client.send(command)
        const originalFilePath = `original-video.mp4`
        await fs.writeFile(originalFilePath, Buffer.from(await result.Body.transformToByteArray()))

        const originalVideoPath = path.resolve(originalFilePath)

        const promises = RESOLUTIONS.map(resolution => {
            const output = `video-${resolution.name}.mp4`

            return new Promise((resolve, reject) => {
                ffmpeg(originalVideoPath)
                    .output(output)
                    .videoCodec("libx264")
                    .audioCodec("aac")
                    .size(`${resolution.width}x${resolution.height}`)
                    .on('end', async () => {
                        try {
                            // Upload the transcoded video
                            const putCommand = new PutObjectCommand({
                                Bucket: process.env.BUCKET,
                                Key: output,
                                Body: await fs.readFile(output),
                            })
                            await s3Client.send(putCommand)
                            console.log(`Uploaded ${output}`)
                            resolve()
                        } catch (uploadError) {
                            console.error(`Error uploading ${output}:`, uploadError)
                            reject(uploadError)
                        }
                    })
                    .on('error', (err) => {
                        console.error(`Error processing ${output}:`, err)
                        reject(err)
                    })
                    .format("mp4")
                    .run()
            })
        })

        await Promise.all(promises)
        console.log("All videos transcoded and uploaded successfully!")
    } catch (err) {
        console.error("Error in processing:", err)
    }
}

init()
