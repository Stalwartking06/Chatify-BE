import multer from "multer";
import path from "path";

// Memory storage (faster for cloud uploads)
const storage = multer.memoryStorage();

// Image validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;

  const isMimeValid = allowedTypes.test(file.mimetype);

  const isExtValid = allowedTypes.test(
    path.extname(file.originalname).toLowerCase(),
  );

  if (isMimeValid && isExtValid) {
    return cb(null, true);
  }

  cb(new Error("Only image files (jpeg, jpg, png, gif, webp) are allowed!"));
};

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },

  fileFilter,
});

export default upload;
