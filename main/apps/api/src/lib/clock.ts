export interface Clock {
  now(): Date;
  nowIso(): string;
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  nowMs(): number {
    return Date.now();
  }
}

export class TestClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date | string | number = new Date('2026-11-10T00:00:00.000Z')) {
    this.currentTime = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  nowIso(): string {
    return this.currentTime.toISOString();
  }

  nowMs(): number {
    return this.currentTime.getTime();
  }

  setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }

  advanceMilliseconds(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

export const defaultClock: Clock = new SystemClock();

