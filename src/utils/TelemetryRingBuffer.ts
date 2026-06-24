// src/utils/TelemetryRingBuffer.ts
// DENETÇİ NOTU: Sabit boyutlu Float32Array ile Sıfır Garbage Collection (GC) sağlanır.
export class TelemetryRingBuffer {
  private buffer: Float32Array;
  private head: number = 0;
  private _count: number = 0;

  get count(): number {
    return this._count;
  }

  constructor(private capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this._count < this.capacity) this._count++;
  }

  // Doğrudan buffer'dan çizim için iterator (Sıfır allocation)
  *iterateFromHead(): Generator<number> {
    const start = (this.head - this._count + this.capacity) % this.capacity;
    for (let i = 0; i < this._count; i++) {
      yield this.buffer[(start + i) % this.capacity];
    }
  }

  // Canvas çizimi için sıralı veri döndürür
  getOrderedData(): Float32Array {
    const result = new Float32Array(this.count);
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[(start + i) % this.capacity];
    }
    return result;
  }
}
