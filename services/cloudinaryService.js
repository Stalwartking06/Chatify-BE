import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

let isCloudinaryConfigured = false;

// Configure Cloudinary if environment variables are provided
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
  console.log('Cloudinary service connected successfully.');
} else {
  console.log('Cloudinary credentials missing. Falling back to local filesystem storage.');
}

/**
 * Uploads a local file to Cloudinary or falls back to returning the local server path
 * @param {string} localFilePath - Path of the file uploaded by Multer
 * @param {string} folderName - Cloudinary folder name (e.g., 'avatars', 'chats')
 * @returns {Promise<string>} - The URL of the uploaded image
 */
export const uploadImage = async (localFilePath, folderName = 'chatapp') => {
  if (!localFilePath) return null;

  try {
    if (isCloudinaryConfigured) {
      // Upload to Cloudinary
      const response = await cloudinary.uploader.upload(localFilePath, {
        folder: folderName,
        resource_type: 'image',
      });
      
      // Delete local file after successful upload to Cloudinary
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
      
      return response.secure_url;
    } else {
      // Fallback: Return local path relative to server URL
      // E.g., /uploads/image-12345.jpg
      const normalizedPath = localFilePath.replace(/\\/g, '/'); // Normalize windows paths
      // In local mode, we keep the file in the /uploads folder and serve it statically
      return `/${normalizedPath}`;
    }
  } catch (error) {
    console.error('Upload Image Service Error:', error);
    // On error, try to return local path as fallback rather than failing completely
    const normalizedPath = localFilePath.replace(/\\/g, '/');
    return `/${normalizedPath}`;
  }
};
