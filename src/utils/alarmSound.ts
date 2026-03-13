export type AlarmSoundPreset = 'beep'

let audioCtx: AudioContext | null = null

function getCtx() {
  if (audioCtx) return audioCtx
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined
  audioCtx = Ctx ? new Ctx() : null
  return audioCtx
}

export async function playAlarmSound(preset: AlarmSoundPreset = 'beep') {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return
    }
  }

  if (preset !== 'beep') return
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, now)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.28)
}

