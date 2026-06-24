export function calculateRequiredVRAM(
  modelSizeMB: number,
  layerCount: number,
  embeddingLength: number,
  contextSize: number
): number {
  // Model weights overhead (~5%)
  const weightsVRAM = modelSizeMB * 1.05;
  
  // KV Cache = 2 (K&V) * 2 (fp16) * layers * ctx * embed
  const kvCacheVRAM = (4 * layerCount * contextSize * embeddingLength) / (1024 * 1024);
  
  // Context overhead (activations, etc.)
  const overhead = kvCacheVRAM * 0.1 + 150; // base overhead
  
  return weightsVRAM + kvCacheVRAM + overhead;
}

export function calculateOOMRisk(
  usedVRAM: number,
  totalVRAM: number
): 'Safe' | 'Marginal' | 'Critical' | 'Unknown' {
  if (totalVRAM === 0) return 'Unknown';
  const percentage = (usedVRAM / totalVRAM) * 100;
  
  if (percentage >= 95) return 'Critical';
  if (percentage >= 85) return 'Marginal';
  return 'Safe';
}
