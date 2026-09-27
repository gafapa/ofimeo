// Math graphs on slides: an image shape (slideGraph=1) whose cell data keeps
// the construction as JSON ({ graph }), synced like any shape. Double click
// opens the graph editor (read-only for viewers, who can still explore it).

import { Cell, Geometry, type Graph } from '@maxgraph/core'
import { styleFromString } from '../diagram/graph'
import { parseGraph, TITLE_PREFIX, type GraphDoc } from '../../ui/mathgraph/model'

type Style = Record<string, unknown>
type DataCell = Cell & { woData?: string }

interface Host {
  graph: Graph
  readOnly: boolean
  inBatch: (fn: () => void) => void
  insertAtCenter: (cells: Cell[]) => void
}

export const isGraphCell = (cell: Cell | null): boolean => !!cell && String((cell.getStyle() as Style | null)?.slideGraph ?? '') === '1'

// draw.io keeps data URIs without ";base64" in style strings (";" separates entries).
const styleImage = (png: string) => png.replace(';base64,', ',')

export async function editSlideGraph(host: Host, cell?: Cell): Promise<void> {
  const [{ editGraph }, { parseGraph }] = await Promise.all([import('../../ui/mathgraph/editor'), import('../../ui/mathgraph/model')])
  let graph: GraphDoc | null = null
  if (cell) {
    try {
      graph = parseGraph(JSON.stringify((JSON.parse((cell as DataCell).woData ?? '{}') as { graph?: unknown }).graph ?? null))
    } catch {
      graph = null
    }
    if (!graph) return
  } else if (host.readOnly) return
  const result = await editGraph({ graph, readOnly: host.readOnly })
  if (!result || host.readOnly) return
  const data = JSON.stringify({ graph: result.doc, alt: result.alt })
  const model = host.graph.getDataModel()
  if (cell) {
    host.inBatch(() => {
      ;(cell as DataCell).woData = data
      const style = cell.getClonedStyle() as Style
      style.image = styleImage(result.png)
      model.setStyle(cell, style as never)
      model.setValue(cell, '')
      // Keep the shape's width; the height follows the graph's proportions.
      const geo = cell.getGeometry()!.clone()
      geo.height = Math.round((geo.width * result.height) / result.width)
      model.setGeometry(cell, geo)
    })
  } else {
    const c = new Cell(
      '',
      new Geometry(0, 0, result.width, result.height),
      styleFromString(`shape=image;slideGraph=1;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;image=${styleImage(result.png)};`),
    )
    c.setVertex(true)
    ;(c as DataCell).woData = data
    host.insertAtCenter([c])
  }
}

// Picture name and alternative text for PPTX (the name brings the graph back on import).
export function graphPictureMeta(woData: string | undefined): { name: string; alt?: string } | undefined {
  try {
    const data = JSON.parse(woData ?? '{}') as { graph?: unknown; alt?: unknown }
    if (!data.graph) return undefined
    return { name: TITLE_PREFIX + JSON.stringify(data.graph), ...(typeof data.alt === 'string' ? { alt: data.alt } : {}) }
  } catch {
    return undefined
  }
}

// Cell data ({ graph }) from a picture name written by graphPictureMeta.
export function graphFromPictureName(name: string | null): string | undefined {
  const graph = name?.startsWith(TITLE_PREFIX) ? parseGraph(name) : null
  return graph ? JSON.stringify({ graph }) : undefined
}
