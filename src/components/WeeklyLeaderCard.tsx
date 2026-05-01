interface WeeklyCoverData {
  imageUrl: string | null
  weekNumber: number | null
  charName: string | null
  score: number | null
}

interface Props {
  data: WeeklyCoverData | null
}

export function WeeklyLeaderCard({ data }: Props) {
  const hasGenerated = !!(data?.imageUrl && data?.weekNumber)

  return (
    <section className="weekly-card">
      <p className="weekly-label">
        {hasGenerated ? `Week ${data!.weekNumber} IO Leader` : 'Weekly IO Leader'}
      </p>
      <div className="weekly-image-wrap">
        <img
          src={data?.imageUrl ?? '/album-cover.png'}
          className="weekly-image"
          alt={hasGenerated ? `Week ${data!.weekNumber} IO leader album cover` : 'Album cover'}
        />
      </div>
      {hasGenerated ? (
        <div className="weekly-info">
          <span className="weekly-char-name">{data!.charName}</span>
          <span className="weekly-char-score">
            {data!.score?.toLocaleString(undefined, { maximumFractionDigits: 1 })} Tank IO
          </span>
        </div>
      ) : (
        <p className="weekly-coming-soon">Weekly leader coming soon</p>
      )}
    </section>
  )
}
