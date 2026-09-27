export type Adapter = {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  fallback: boolean;
};

/** A device with the adapter's largest buffer limits, and the adapter's identity. */
export async function gpu(): Promise<{ device: GPUDevice; adapter: Adapter }> {
  if (!navigator.gpu) throw new Error("WebGPU is not available in this browser.");
  const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!a) throw new Error("WebGPU is available, but no GPU adapter was found.");
  const device = await a.requestDevice({
    requiredLimits: {
      maxBufferSize: a.limits.maxBufferSize,
      maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize,
    },
  });
  const { vendor, architecture, device: name, description, isFallbackAdapter } = a.info;
  return {
    device,
    adapter: { vendor, architecture, device: name, description, fallback: isFallbackAdapter },
  };
}

/** Copy `buffers` into one mapped buffer and read them back after pending work finishes. */
export async function read(device: GPUDevice, ...buffers: GPUBuffer[]): Promise<Uint32Array[]> {
  const size = buffers.reduce((s, b) => s + b.size, 0);
  const staging = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  let offset = 0;
  for (const b of buffers) {
    enc.copyBufferToBuffer(b, 0, staging, offset, b.size);
    offset += b.size;
  }
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const all = new Uint32Array(staging.getMappedRange().slice(0));
  staging.destroy();
  offset = 0;
  return buffers.map((b) => all.subarray((offset += b.size) / 4 - b.size / 4, offset / 4));
}

/** A storage buffer initialised with `data`. */
export function storage(device: GPUDevice, data: Uint32Array): GPUBuffer {
  const b = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(b, 0, data);
  return b;
}
