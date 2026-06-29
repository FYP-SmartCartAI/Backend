/** Structured console logs for the semantic AI search pipeline */

const TAG = '[AI Search]'

const line = () => console.log(`${TAG} ${'─'.repeat(58)}`)

export const logSearchStart = ({ rawQuery, topK }) => {
  console.log(`\n${TAG} ${'═'.repeat(58)}`)
  console.log(`${TAG} SEMANTIC AI SEARCH — START`)
  console.log(`${TAG} Raw query : "${rawQuery}"`)
  console.log(`${TAG} Top K     : ${topK}`)
  line()
}

export const logQueryParse = ({ semanticQuery, embeddingQuery, maxPrice, minPrice, priceFilter, intent }) => {
  console.log(`${TAG} STEP 1 — Query parsing`)
  console.log(`${TAG}   Semantic text : "${semanticQuery}"`)
  if (embeddingQuery && embeddingQuery !== semanticQuery) {
    console.log(`${TAG}   Embed text    : "${embeddingQuery}" (refined)`)
  }
  console.log(`${TAG}   Max price     : ${maxPrice ?? 'none'}`)
  console.log(`${TAG}   Min price     : ${minPrice ?? 'none'}`)
  console.log(`${TAG}   Price filter  : ${priceFilter ? JSON.stringify(priceFilter) : 'none'}`)
  if (intent) {
    console.log(`${TAG}   Product intent: ${intent.type}`)
    console.log(`${TAG}   Categories    : ${intent.categories.join(', ')}`)
    if (intent.sourceProduct) console.log(`${TAG}   Catalog match : "${intent.sourceProduct}"`)
    if (intent.source === 'groq') {
      console.log(`${TAG}   Groq intent   : ${intent.productType ?? intent.type} (confidence ${intent.confidence})`)
      if (intent.keywords?.length) console.log(`${TAG}   Groq keywords : ${intent.keywords.join(', ')}`)
    }
    if (intent.excludeName) console.log(`${TAG}   Exclude names : ${intent.excludeName}`)
    if (intent.nameInclude) console.log(`${TAG}   Require names : ${intent.nameInclude}`)
  } else {
    console.log(`${TAG}   Product intent: none (open semantic search)`)
  }
  line()
}

export const logPath = (pathName, detail = '') => {
  console.log(`${TAG} STEP 2 — Route: ${pathName}${detail ? ` (${detail})` : ''}`)
  line()
}

export const logGeminiEmbed = ({ inputText, taskType, vectorLength, vectorPreview }) => {
  console.log(`${TAG} STEP 3 — Gemini embedding`)
  console.log(`${TAG}   Task type     : ${taskType}`)
  console.log(`${TAG}   Input text    : "${inputText}"`)
  if (vectorLength) {
    console.log(`${TAG}   Vector dims   : ${vectorLength}`)
    console.log(`${TAG}   Vector preview: [${vectorPreview?.join(', ')}…]`)
  } else {
    console.warn(`${TAG}   Vector dims   : FAILED (null/empty)`)
  }
  line()
}

export const logPineconeQuery = ({ topK, filter, matchCount }) => {
  console.log(`${TAG} STEP 4 — Pinecone vector query`)
  console.log(`${TAG}   topK          : ${topK}`)
  console.log(`${TAG}   Metadata filter: ${filter && Object.keys(filter).length ? JSON.stringify(filter) : 'none'}`)
  console.log(`${TAG}   Matches returned: ${matchCount}`)
  line()
}

export const logPineconeMatches = (matches) => {
  if (!matches?.length) {
    console.log(`${TAG}   (no Pinecone matches)`)
    return
  }
  console.log(`${TAG}   Pinecone ranking:`)
  matches.forEach((m, i) => {
    const meta = m.metadata || {}
    console.log(
      `${TAG}     #${i + 1} id=${m.id} | score=${m.score?.toFixed(4) ?? '—'}` +
      ` | name="${meta.name || '—'}" | category="${meta.category || '—'}"` +
      ` | brand="${meta.brand || '—'}"`,
    )
  })
  line()
}

export const logMongoFetch = ({ idsRequested, mongoFilter, productsFound }) => {
  console.log(`${TAG} STEP 5 — MongoDB product fetch`)
  console.log(`${TAG}   IDs from Pinecone : ${idsRequested.length}`)
  console.log(`${TAG}   Mongo filter      : ${JSON.stringify(mongoFilter)}`)
  console.log(`${TAG}   Products matched  : ${productsFound.length}`)
  line()
}

export const logFilterPass = (label, { before, after, dropped }) => {
  console.log(`${TAG} STEP 6 — ${label}`)
  console.log(`${TAG}   Before filter : ${before}`)
  console.log(`${TAG}   After filter  : ${after}`)
  if (dropped?.length) {
    console.log(`${TAG}   Dropped (${dropped.length}):`)
    dropped.forEach((d) => {
      console.log(`${TAG}     - "${d.name}" | reason: ${d.reason}`)
    })
  }
  line()
}

export const logFinalResults = (products, path) => {
  console.log(`${TAG} STEP 7 — Final results (${path})`)
  if (!products?.length) {
    console.log(`${TAG}   ⚠️  0 products returned to client`)
  } else {
    products.forEach((p, i) => {
      const cat = typeof p.category === 'object' ? p.category?.name : p.category
      console.log(
        `${TAG}   #${i + 1} "${p.name}" | Rs ${p.price?.toLocaleString() ?? '—'}` +
        ` | ${cat || '—'} | stock=${p.stock ?? '—'} | rating=${p.rating ?? '—'}`,
      )
    })
  }
  console.log(`${TAG} ${'═'.repeat(58)}`)
  console.log(`${TAG} SEMANTIC AI SEARCH — END (${products?.length ?? 0} result(s))\n`)
}

export const logIntentDbSearch = ({ intent, sort, filter, candidateCount, resultCount }) => {
  console.log(`${TAG} STEP 3 — MongoDB intent search (skips Pinecone)`)
  console.log(`${TAG}   Intent type   : ${intent.type}`)
  console.log(`${TAG}   DB filter     : ${JSON.stringify(filter)}`)
  console.log(`${TAG}   Sort          : ${JSON.stringify(sort)}`)
  console.log(`${TAG}   DB candidates : ${candidateCount}`)
  console.log(`${TAG}   After intent  : ${resultCount}`)
  line()
}
