class RaqmivaCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.readPosition = 0;
    this.inputBuffer = [];
    this.pendingSamples = [];
    this.chunkSize = 2048;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (output) output.fill(0);
    if (!input) return true;

    for (let index = 0; index < input.length; index += 1) {
      this.inputBuffer.push(input[index]);
    }

    const step = sampleRate / this.targetSampleRate;
    while (this.readPosition + 1 < this.inputBuffer.length) {
      const lowerIndex = Math.floor(this.readPosition);
      const fraction = this.readPosition - lowerIndex;
      const lowerSample = this.inputBuffer[lowerIndex];
      const upperSample = this.inputBuffer[lowerIndex + 1];
      const sample = lowerSample + (upperSample - lowerSample) * fraction;
      const clamped = Math.max(-1, Math.min(1, sample));
      this.pendingSamples.push(
        clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      );
      this.readPosition += step;
    }

    const consumedSamples = Math.floor(this.readPosition);
    if (consumedSamples > 0) {
      this.inputBuffer = this.inputBuffer.slice(consumedSamples);
      this.readPosition -= consumedSamples;
    }

    while (this.pendingSamples.length >= this.chunkSize) {
      const chunk = new Int16Array(this.chunkSize);
      for (let index = 0; index < this.chunkSize; index += 1) {
        chunk[index] = this.pendingSamples[index];
      }
      this.pendingSamples.splice(0, this.chunkSize);
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor("raqmiva-capture", RaqmivaCaptureProcessor);
