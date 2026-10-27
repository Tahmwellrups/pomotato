/** True when the browser can fully decode the image at `url`. Never rejects. */
export async function canDecodeImage(url: string): Promise<boolean> {
  const probe = new Image();
  probe.src = url;
  try {
    await probe.decode();
    return true;
  } catch {
    return false;
  }
}

/** Same check for a file the user just picked; the temporary object URL is always released. */
export async function canDecodeFile(file: Blob): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    return await canDecodeImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
