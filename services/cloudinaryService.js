import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

let isCloudinaryConfigured = false;

// Configure Cloudinary
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  isCloudinaryConfigured = true;

  if (process.env.NODE_ENV !== 'production') {
    console.log('Cloudinary service connected successfully.');
  }

} else {

  console.log(
    'Cloudinary credentials missing.'
  );
}

/**
 * Upload image buffer to Cloudinary
 * @param {Buffer} fileBuffer
 * @param {string} folderName
 * @returns {Promise<string|null>}
 */
export const uploadImage = async (
  fileBuffer,
  folderName = 'chatapp'
) => {

  if (!fileBuffer) {
    return null;
  }

  try {

    // Cloudinary not configured
    if (!isCloudinaryConfigured) {
      return null;
    }

    // Upload buffer stream
    const uploadedImage = await new Promise((resolve, reject) => {

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folderName,
          resource_type: 'image',
        },

        (error, result) => {

          if (error) {
            return reject(error);
          }

          resolve(result);
        }
      );

      streamifier
        .createReadStream(fileBuffer)
        .pipe(uploadStream);
    });

    return uploadedImage.secure_url;

  } catch (error) {

    console.error(
      'Upload Image Service Error:',
      error.message
    );

    return null;
  }
};