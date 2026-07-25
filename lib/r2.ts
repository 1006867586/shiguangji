import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { generateObjectKey, getExt } from "./utils";
import { PRESIGN_EXPIRY_SECONDS } from "./constants";

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error("Cloudflare R2 环境变量未配置完整");
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

let cachedClient: S3Client | null = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  return cachedClient;
}

/**
 * 生成 R2 PUT 预签名上传 URL。
 * @returns { presignedUrl, publicUrl, key }
 */
export async function createPresignedUploadUrl(opts: {
  filename: string;
  contentType: string;
}): Promise<{ presignedUrl: string; publicUrl: string; key: string }> {
  const { bucket, publicUrl } = getR2Config();
  const ext = getExt(opts.filename);
  const key = generateObjectKey(ext);
  const client = getClient();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: opts.contentType,
  });

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
  });

  const baseUrl = publicUrl.replace(/\/$/, "");
  const publicImageUrl = `${baseUrl}/${key}`;

  return { presignedUrl, publicUrl: publicImageUrl, key };
}

/**
 * 仅校验 R2 是否配置完成。
 */
export function isR2Configured(): boolean {
  try {
    getR2Config();
    return true;
  } catch {
    return false;
  }
}
