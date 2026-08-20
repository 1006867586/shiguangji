import Taro from "@tarojs/taro";
import { request } from "./request";

/**
 * R2 预签名直传（工具属性：收藏夹截图导入、头像上传）。
 *
 * 流程：
 * 1. POST /api/upload/presign 拿 { presignedUrl, publicUrl }
 * 2. FileSystemManager 读文件为 base64 → ArrayBuffer
 * 3. Taro.request PUT 二进制到 presignedUrl
 *
 * 说明：Taro.uploadFile 只支持 multipart POST，而 R2 预签名是 PUT，
 * 因此走 readFile + ArrayBuffer 通道（微信基础库支持 request body 为 ArrayBuffer）。
 * 单文件建议 < 5MB（上传前用 chooseMedia 的 compressed 压缩）。
 */

interface PresignResult {
  presignedUrl: string;
  publicUrl: string;
  key: string;
}

/** 单文件字节上限（超出的直接提示，避免 readFile 撑爆内存） */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * 把可读路径归一化：
 * - chooseAvatar 在部分机型/基础库返回的是 `http://tmp/xxx`（http 临时协议）路径，
 *   FileSystemManager.readFile 读不了 http 路径，会比失败。这里先 downloadFile
 *   落盘到本地可读文件，再返回给 readFile。
 * - 其余本地路径（wxfile://tmp、chooseMedia 的 tempFilePath）原样返回。
 */
function toReadablePath(filePath: string): Promise<string> {
  // 非 http 开头的直接用
  if (!/^https?:\/\/\S+/.test(filePath)) return Promise.resolve(filePath);

  return new Promise((resolve, reject) => {
    const fs = Taro.getFileSystemManager();
    // 落盘到用户目录下的稳定路径，避免临时目录被回收
    const dest = `${Taro.env.USER_DATA_PATH}/r2_upload_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}${filePath.split("?")[0].split(".").pop() ? "." + filePath.split("?")[0].split(".").pop() : ""}`;
    fs.downloadFile({
      url: filePath,
      filePath: dest,
      success: () => resolve(dest),
      fail: (err) => reject(new Error(err.errMsg || "文件下载失败")),
    });
  });
}

function readFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (res) => {
        try {
          resolve(Taro.base64ToArrayBuffer(res.data as string));
        } catch (e) {
          reject(e instanceof Error ? e : new Error("文件读取失败"));
        }
      },
      fail: (err) => reject(new Error(err.errMsg || "文件读取失败")),
    });
  });
}

/**
 * 直传本地文件到 R2，成功返回公开 URL。
 * @param filePath 本地临时文件路径（chooseMedia 返回的 tempFilePath）
 * @param contentType MIME 类型，默认按扩展名推断
 */
export async function uploadToR2(
  filePath: string,
  contentType?: string
): Promise<string> {
  // 从路径推断扩展名与 MIME
  const ext = (filePath.split("?")[0].split(".").pop() || "jpg").toLowerCase();
  const mime =
    contentType ||
    ({
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      heic: "image/heic",
      mp4: "video/mp4",
      mov: "video/quicktime",
    } as Record<string, string>)[ext] ||
    "image/jpeg";

  // 预检大小（获取失败不阻塞，交由 readFile 兜底）
  // 注意：wx.getFileInfo 已废弃，改用 FileSystemManager.getFileInfo
  const info = await new Promise<{ fileSize: number } | null>((resolve) => {
    try {
      const fs = Taro.getFileSystemManager();
      fs.getFileInfo({
        filePath,
        success: (r) => resolve({ fileSize: r.size }),
        fail: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
  const fileSize = info?.fileSize ?? 0;
  if (fileSize > MAX_BYTES) {
    throw new Error("文件超过 10MB，请压缩后重试");
  }

  // 1. 预签名
  const presign = await request<PresignResult>("/api/upload/presign", {
    method: "POST",
    data: {
      filename: `upload.${ext}`,
      contentType: mime,
      kind: mime.startsWith("video/") ? "video" : "image",
    },
  });
  if (!presign?.presignedUrl || !presign?.publicUrl) {
    throw new Error("获取上传凭证失败");
  }

  // 2. 归一化路径（http://tmp 等临时路径落盘可读）→ 读为 ArrayBuffer
  const readablePath = await toReadablePath(filePath);
  const buffer = await readFileAsArrayBuffer(readablePath);

  // 3. PUT 直传（presignedUrl 是 R2 域名，不走 API_BASE_URL，也不带鉴权头）
  const res = await Taro.request({
    url: presign.presignedUrl,
    method: "PUT",
    data: buffer,
    header: { "content-type": mime },
    timeout: 60_000,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`直传失败（${res.statusCode}）`);
  }
  return presign.publicUrl;
}

/** 批量直传，返回成功上传的 URL 列表（单个失败即中断并抛错） */
export async function uploadFilesToR2(
  filePaths: string[],
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < filePaths.length; i++) {
    urls.push(await uploadToR2(filePaths[i]));
    onProgress?.(i + 1, filePaths.length);
  }
  return urls;
}
