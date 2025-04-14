// 导入日志添加函数
import { addLog } from '@fastgpt/service/common/system/log';

const { Baseurl, Name, Password } = global.systemEnv.customEncryption || {};
let cachedLoginId: string | null = null;

// 加密文件
export async function encryptFile(filePath: string): Promise<boolean> {
  if (!hasValidEncryptionConfig()) {
    return true;
  }
  const reqParam = {
    files: [filePath],
    setting: [
      {
        guid: '00000000-0000-0000-0000-000000000000',
        level: '0'
      }
    ],
    access: [
      {
        guid: '00000000-0000-0000-0000-000000000000',
        level: '0'
      }
    ]
  };

  try {
    // 首次尝试加密
    if (!cachedLoginId) {
      const newLoginId = await getEncryptionSystemLoginId();
      if (!newLoginId) return false;
    }

    let response = await sendRequest('encryptFile', {
      LoginID: cachedLoginId,
      Param: reqParam
    });

    // 处理会话过期的情况（错误码61453）
    if (response.error === '61453') {
      cachedLoginId = null; // 清除旧登录ID
      const newLoginId = await getEncryptionSystemLoginId();
      if (!newLoginId) return false;

      response = await sendRequest('encryptFile', {
        LoginID: cachedLoginId,
        Param: reqParam
      });
    }

    if (response.error === '0') {
      return true;
    }
    throw new Error(`Encrypt file failed: ${response.desc || `Unknown error: ${response.error}`}`);
  } catch (error) {
    addLog.error('Encryption error', error);
    return false;
  }
}

// 解密文件
export async function decryptFile(filePath: string): Promise<boolean> {
  if (!hasValidEncryptionConfig()) {
    return true;
  }

  try {
    // 首次尝试解密
    if (!cachedLoginId) {
      const newLoginId = await getEncryptionSystemLoginId();
      if (!newLoginId) return false;
    }

    let response = await sendRequest('decryptFile', {
      LoginID: cachedLoginId,
      File: filePath
    });

    // 处理会话过期的情况（错误码61453）
    if (response.error === '61453') {
      cachedLoginId = null; // 清除旧登录ID
      const newLoginId = await getEncryptionSystemLoginId();
      if (!newLoginId) return false;

      response = await sendRequest('decryptFile', {
        LoginID: cachedLoginId,
        File: filePath
      });
    }

    if (response.error === '0') {
      return true;
    }
    throw new Error(' decryptfile failed:', response.desc || `Unknown error: ${response.error}`);
  } catch (error) {
    addLog.error('Decryption error', error);
    return false;
  }
}

// 判断加密系统配置信息
function hasValidEncryptionConfig(): boolean {
  return !!(Baseurl && Name && Password);
}

// 登录获取loginid
async function getEncryptionSystemLoginId(): Promise<string | null> {
  if (!hasValidEncryptionConfig()) {
    return null;
  }

  try {
    const response = await sendRequest('login', {
      Name: Name,
      Password: Password
    });

    if (response.error === '0') {
      cachedLoginId = response.loginid;
      return cachedLoginId;
    }

    throw new Error(` login failed with server error code: ${response.error}`);
  } catch (error) {
    throw error;
  }
}
// 发送请求（修改后的 sendRequest）
async function sendRequest(callFunction: string, requestData: any): Promise<any> {
  try {
    const response = await fetch(`${Baseurl}/${callFunction}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      throw new Error(` ${callFunction} HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw error;
  }
}
