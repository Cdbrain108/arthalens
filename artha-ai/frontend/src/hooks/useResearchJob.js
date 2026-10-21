import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { createResearchJob, initialResearchState } from './researchJob'

export function useResearchJob() {
  const [state, setState] = useState(initialResearchState)
  const controller = useRef(null)
  if (!controller.current) controller.current = createResearchJob(api, setState, setTimeout, clearTimeout, 800)

  useEffect(() => () => controller.current.dispose(), [])
  return { ...state, ...controller.current }
}
