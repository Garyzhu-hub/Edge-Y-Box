export type PersonStatus = '在职' | '离职'

export type PersonRecord = {
  id: string
  name: string
  phone: string
  dept: string
  title: string
  email: string
  status: PersonStatus
  tags: string[]
  createdAtMs: number
  updatedAtMs: number
}

function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeDefaultPeople(nowMs = Date.now()): PersonRecord[] {
  const rand = mulberry32(20260311)
  const depts = ['平台', '运维', '安保', '项目', '物业']
  const titles = ['管理员', '值班员', '工程师', '队长', '经理']
  const names = ['admin', '值班A', '值班B', '安保队长', '项目经理', '平台工程师', '运维主管', '物业值守']
  const tagsPool = ['短信', '电话', '弹屏', '只读', '值班', '负责人']

  const list = Array.from({ length: 10 }).map((_, i): PersonRecord => {
    const dept = depts[Math.floor(rand() * depts.length)]
    const title = titles[Math.floor(rand() * titles.length)]
    const name = names[i % names.length]
    const createdAtMs = nowMs - Math.floor((3 + rand() * 40) * 24 * 60 * 60 * 1000)
    const updatedAtMs = createdAtMs + Math.floor(rand() * 8 * 24 * 60 * 60 * 1000)
    const status: PersonStatus = rand() > 0.12 ? '在职' : '离职'
    const tags = tagsPool.filter(() => rand() > 0.65).slice(0, 3)
    const phone = `1380000${String(1000 + i).slice(1)}`
    const email = `${name.replace(/\s+/g, '').toLowerCase()}@demo.local`
    return {
      id: i === 0 ? 'u_admin' : `p_${String(1000 + i).padStart(4, '0')}`,
      name,
      phone,
      dept,
      title,
      email,
      status,
      tags,
      createdAtMs,
      updatedAtMs,
    }
  })

  return list.sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

