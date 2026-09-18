import { useState } from 'react'
import { ProducerDataTree } from './ProducerDataTree'
import { PlantingDetail } from './PlantingDetail'

// One way into the producer's own data: a real collapsible parcel ->
// plot -> row -> planting tree (replacing the old level-by-level button
// drill-down), with each planting leaf opening straight into its
// observations too -- "drilling into more tables" without a fifth tree
// level.
//
// There was a second mode, a zoomable grid of every position in a plot
// as a coloured dot, meant for scanning a whole plot's health at a
// glance. It went in UAT: most of the dots read grey, because status is
// only known for the few plantings that have a dead or removed date, so
// the thing it promised to show at a glance was mostly absent. Plot
// geometry is about to be handled properly by GIS, which is the right
// place for a spatial view of a plot -- so this was removed rather than
// patched, instead of carrying a half-working version until its
// replacement lands.
//
// This view deliberately breaks from the rest of the app's pixel-art
// chrome (plain system-ui type, a denser neutral layout) -- a real data
// browsing tool reads better dense and modern than playful, the same
// reasoning that already gave chat's assistant messages a plain font
// instead of the pixel one.
export function ProducerDataView({ onClose }: { onClose: () => void }) {
  const [selectedPlantingId, setSelectedPlantingId] = useState<string | null>(null)

  return (
    <div className="pdv-overlay">
      <div className="pdv-header">
        <h2>Your Vineyard Data</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="pdv-close">
          &times;
        </button>
      </div>
      <div className="pdv-body">
        <ProducerDataTree onSelectPlanting={setSelectedPlantingId} />
      </div>
      {selectedPlantingId && (
        <PlantingDetail plantingId={selectedPlantingId} onClose={() => setSelectedPlantingId(null)} />
      )}
    </div>
  )
}
