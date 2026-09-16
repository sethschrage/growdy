import { useState } from 'react'
import { ProducerDataTree } from './ProducerDataTree'
import { ProducerDataGrid } from './ProducerDataGrid'
import { PlantingDetail } from './PlantingDetail'

type Mode = 'tree' | 'grid'

// Two ways into the same producer data, sharing one detail panel:
//
// - Tree: a real collapsible parcel -> plot -> row -> planting tree
//   (replacing the old level-by-level button drill-down), with each
//   planting leaf opening straight into its observations too --
//   "drilling into more tables" without a fifth tree level.
// - Grid: every position in a plot as a colored dot, zoomable, for
//   scanning a whole plot's health at a glance instead of one row at a
//   time.
//
// This view deliberately breaks from the rest of the app's pixel-art
// chrome (plain system-ui type, a denser neutral layout) -- a real data
// browsing tool reads better dense and modern than playful, the same
// reasoning that already gave chat's assistant messages a plain font
// instead of the pixel one.
export function ProducerDataView({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('tree')
  const [selectedPlantingId, setSelectedPlantingId] = useState<string | null>(null)

  return (
    <div className="pdv-overlay">
      <div className="pdv-header">
        <h2>Your Vineyard Data</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="pdv-close">
          &times;
        </button>
      </div>
      <div className="pdv-mode-toggle">
        <button
          type="button"
          className={`pdv-mode-button${mode === 'tree' ? ' pdv-mode-button--active' : ''}`}
          onClick={() => setMode('tree')}
        >
          Tree
        </button>
        <button
          type="button"
          className={`pdv-mode-button${mode === 'grid' ? ' pdv-mode-button--active' : ''}`}
          onClick={() => setMode('grid')}
        >
          Grid
        </button>
      </div>
      <div className="pdv-body">
        {mode === 'tree' ? (
          <ProducerDataTree onSelectPlanting={setSelectedPlantingId} />
        ) : (
          <ProducerDataGrid onSelectPlanting={setSelectedPlantingId} />
        )}
      </div>
      {selectedPlantingId && (
        <PlantingDetail plantingId={selectedPlantingId} onClose={() => setSelectedPlantingId(null)} />
      )}
    </div>
  )
}
