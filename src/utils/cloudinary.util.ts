import { UploadApiResponse } from "cloudinary";
import cloudinary from "../config/cloudinary";

// Kirim file dari memori (buffer) ke Cloudinary
export function uploadImage(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: "image" },
            (error, result) => {
                if (error || !result) {
                    reject(error ?? new Error("Upload ke Cloudinary gagal"));
                    return;
                }
                resolve(result);
            }
        );
        stream.end(buffer);
    });
}

// Hapus gambar dari Cloudinary (gagal dihapus tidak menggagalkan request)
export async function deleteImage(publicId: string | null | undefined) {
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Gagal menghapus gambar di Cloudinary:", error);
    }
}