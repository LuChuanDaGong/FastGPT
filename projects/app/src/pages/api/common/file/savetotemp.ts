import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { getNanoid } from '@fastgpt/global/common/string/tools';

// 新增 CSV 写入函数
export async function saveCsvToTemp(
  header: string,
  onData: (write: (data: string) => void) => void,
  filename?: string
): Promise<string> {
  const tempDir = '/app/data/fastgptTempfiles/download/';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const uniqueFilename = filename ? filename : `${getNanoid()}.csv`;
  const tempFilePath = path.join(tempDir, uniqueFilename);
  const writeStream = fs.createWriteStream(tempFilePath);

  // 写入 CSV 头部
  writeStream.write(`\uFEFF${header}`);

  // 创建写入函数
  const write = (data: string) => {
    writeStream.write(data);
  };

  // 执行数据写入
  await onData(write);

  // 等待写入完成
  await new Promise((resolve, reject) => {
    writeStream.end(() => resolve(null));
    writeStream.on('error', reject);
  });

  return tempFilePath;
}

// 原有的 saveToTemp 函数保持不变
export async function saveToTemp(
  fileStream: Readable,
  originalFilename: string,
  filename?: string // 新增可选参数
): Promise<string> {
  const tempDir = '/app/data/fastgptTempfiles/download/';
  // 检查临时目录是否存在，如果不存在则创建
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 生成文件名逻辑修改
  const { ext } = path.parse(originalFilename);
  const uniqueFilename = filename
    ? `${path.basename(filename, ext)}${ext}` // 使用指定文件名（过滤路径）
    : `${getNanoid()}${ext}`; // 保留原生成逻辑作为备选

  // 生成临时文件的完整路径
  const tempFilePath = path.join(tempDir, uniqueFilename);
  const writeStream = fs.createWriteStream(tempFilePath);
  // 将文件流写入临时文件
  fileStream.pipe(writeStream);

  // 等待写入完成或出现错误
  await new Promise((resolve, reject) => {
    // 修改为不传递参数调用 resolve
    writeStream.on('finish', () => resolve(null));
    writeStream.on('error', reject);
    writeStream.on('error', reject);
  });

  return tempFilePath;
}
