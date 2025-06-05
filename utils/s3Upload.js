const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3');

const uploadToS3 = async (file, folder = 'covers') => {
    try {
        // Debug logs
        console.log('S3 Configuration:', {
            bucket: process.env.AWS_S3_BUCKET,
            region: process.env.AWS_REGION,
            hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
            hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY
        });

        const fileExtension = file.originalname.split('.').pop();
        const fileName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExtension}`;

        if (!process.env.AWS_S3_BUCKET) {
            throw new Error('AWS_S3_BUCKET environment variable is not set');
        }

        // Upload file without ACL
        const uploadCommand = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype
        });

        await s3Client.send(uploadCommand);

        // Generate a signed URL that expires in 1 hour
        const getCommand = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName
        });

        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

        // Return both the signed URL and the S3 key
        return {
            url: signedUrl,
            key: fileName
        };
    } catch (error) {
        console.error('S3 Upload Error:', error);
        throw new Error('Failed to upload file to S3');
    }
};

module.exports = uploadToS3; 