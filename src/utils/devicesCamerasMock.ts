import type { Camera, CameraProtocol } from '@/components/devices/CameraFormDialog.vue'

export type Status = '在线' | '离线' | '禁用'

export type TreeNode = { id: string; label: string; children?: TreeNode[]; fixed?: boolean }

export const groupTree: TreeNode[] = [
  {
    id: 'all',
    label: '全部分组',
    fixed: true,
    children: [
      {
        id: 'default',
        label: '默认分组',
        fixed: true,
      },
      {
        id: 'campus-a',
        label: '园区A',
        children: [
          { id: 'a-l1', label: '1号楼' },
          { id: 'a-l2', label: '2号楼' },
          { id: 'a-square', label: '景观广场' },
        ],
      },
      {
        id: 'campus-b',
        label: '园区B',
        children: [
          { id: 'b-north', label: '北门出入口' },
          { id: 'b-east', label: '东门岗亭' },
          { id: 'b-parking', label: '地库B2' },
        ],
      },
    ],
  },
]

export function flattenGroupOptions(tree: TreeNode[]) {
  const list: { id: string; label: string }[] = []
  function walk(nodes: TreeNode[], parentPath: string) {
    for (const n of nodes) {
      const path = parentPath ? `${parentPath} / ${n.label}` : n.label
      if (n.id !== 'all') list.push({ id: n.id, label: path })
      if (n.children) walk(n.children, path)
    }
  }
  walk(tree, '')
  return [{ id: 'all', label: '全部分组' }, ...list]
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

function makeGbId(seed: string, prefix = '3402000000132') {
  const p = prefix.replace(/\D/g, '').slice(0, 19) || '3402000000132'
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const suffixLen = Math.max(1, 20 - p.length)
  const mod = Math.pow(10, suffixLen)
  const suffix = String((h >>> 0) % mod).padStart(suffixLen, '0')
  return `${p}${suffix}`.slice(0, 20)
}

export function makeMockCameras(groups: { id: string; label: string }[], seed = 20260311) {
  const rand = mulberry32(seed)
  const protocols: CameraProtocol[] = ['RTSP', 'GB28181', 'HTTP', 'ONVIF']
  const names = ['北门出入口-3', '东门岗亭-1', '景观广场-1', '1号楼大堂-2', '地库B2-5']
  const usableGroups = groups.filter((g) => g.id !== 'all')

  return Array.from({ length: 18 }).map((_, i): Camera => {
    const groupId = usableGroups[Math.floor(rand() * usableGroups.length)]?.id || 'a-l1'
    const protocol = protocols[Math.floor(rand() * protocols.length)]
    const name = `${names[Math.floor(rand() * names.length)]}-${i + 1}`
    const ip = `192.168.${10 + Math.floor(rand() * 8)}.${10 + Math.floor(rand() * 200)}`
    const port = protocol === 'HTTP' ? 80 : protocol === 'GB28181' ? 5060 : 554
    const enabled = rand() > 0.12
    const updatedAtMs = Date.now() - Math.floor(rand() * 5 * 24 * 60 * 60 * 1000)
    const streamUrl =
      protocol === 'RTSP'
        ? `rtsp://user:pass@${ip}:${port}/stream`
        : protocol === 'GB28181'
          ? `sip:${ip}:${port}`
          : protocol === 'ONVIF'
            ? `onvif://${ip}:${port}`
            : `http://${ip}:${port}/live`

    return {
      id: `CAM-${10000 + i}`,
      name,
      groupId,
      ip,
      port,
      protocol,
      streamUrl,
      gbDeviceId: protocol === 'GB28181' ? makeGbId(`CAM-${10000 + i}`) : '',
      username: 'admin',
      password: '******',
      enabled,
      updatedAtMs,
    }
  })
}

export function computedStatus(c: Camera): Status {
  if (!c.enabled) return '禁用'
  const s = (c.ip.charCodeAt(c.ip.length - 1) + c.port) % 7
  return s < 5 ? '在线' : '离线'
}
