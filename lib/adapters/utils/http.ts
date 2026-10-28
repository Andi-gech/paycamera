export interface BinaryResponse {
  status: number;
  contentType: string;
  contentDisposition: string;
  bytes: Uint8Array;
}

export function fetchBinary(
  url: string,
  headers?: Record<string, string>,
  timeoutMs: number = 25000
): Promise<BinaryResponse> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest !== 'undefined') {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.timeout = timeoutMs;

        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            xhr.setRequestHeader(k, v);
          }
        }

        xhr.onload = () => {
          const contentType = xhr.getResponseHeader('content-type') ?? '';
          const contentDisposition = xhr.getResponseHeader('content-disposition') ?? '';
          let bytes: Uint8Array;

          if (xhr.response instanceof ArrayBuffer) {
            bytes = new Uint8Array(xhr.response);
          } else if (ArrayBuffer.isView(xhr.response)) {
            bytes = new Uint8Array(
              xhr.response.buffer as ArrayBuffer,
              xhr.response.byteOffset,
              xhr.response.byteLength
            );
          } else if (typeof xhr.response === 'string') {
            const str = xhr.response;
            bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
              bytes[i] = str.charCodeAt(i) & 0xff;
            }
          } else {
            bytes = new Uint8Array(0);
          }

          console.log('[PHONE] XHR loaded status:', xhr.status, 'bytes length:', bytes.length);

          if (bytes.length > 0 || xhr.status !== 200) {
            resolve({
              status: xhr.status,
              contentType,
              contentDisposition,
              bytes,
            });
            return;
          }

          fallbackFetch();
        };

        xhr.onerror = () => fallbackFetch();
        xhr.ontimeout = () => reject(new Error('Network request timed out'));
        xhr.send();
        return;
      } catch (err) {
        console.warn('XHR initialization error, falling back to fetch:', err);
      }
    }

    function fallbackFetch() {
      fetch(url, { headers })
        .then(async (res) => {
          const contentType = res.headers.get('content-type') ?? '';
          const contentDisposition = res.headers.get('content-disposition') ?? '';
          let bytes = new Uint8Array(0);

          try {
            const ab = await res.arrayBuffer();
            if (ab && ab.byteLength > 0) {
              bytes = new Uint8Array(ab);
            }
          } catch { }

          if (bytes.length === 0 && typeof res.blob === 'function') {
            try {
              const blob = await res.blob();
              if (blob && typeof FileReader !== 'undefined') {
                const blobBuf = await new Promise<ArrayBuffer | null>((resBlob) => {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    if (reader.result instanceof ArrayBuffer) {
                      resBlob(reader.result);
                    } else {
                      resBlob(null);
                    }
                  };
                  reader.onerror = () => resBlob(null);
                  reader.readAsArrayBuffer(blob);
                });
                if (blobBuf) {
                  bytes = new Uint8Array(blobBuf);
                }
              }
            } catch { }
          }

          resolve({
            status: res.status,
            contentType,
            contentDisposition,
            bytes,
          });
        })
        .catch(reject);
    }

    fallbackFetch();
  });
}

