import { useEffect, useState, type CSSProperties } from 'react';
import {
  EditorRoadmapRenderer,
  type RoadmapRendererProps,
} from './EditorRoadmapRenderer';
import { Spinner } from '../ReactIcons/Spinner';
import {
  clearMigratedRoadmapProgress,
  type ResourceType,
} from '../../lib/resource-progress';
import { httpGet } from '../../lib/http';
import { getUrlParams } from '../../lib/browser.ts';
import { RoadmapFloatingChat } from '../FrameRenderer/RoadmapFloatingChat.tsx';
import type { Node, Edge } from '~/lib/editor-shim';

type EditorRoadmapProps = {
  resourceId: string;
  resourceType?: ResourceType;
  hasChat?: boolean;
  dimensions: {
    width: number;
    height: number;
  };
  nodes?: Node[];
  edges?: Edge[];
};

export function EditorRoadmap(props: EditorRoadmapProps) {
  const {
    resourceId,
    resourceType = 'roadmap',
    dimensions,
    hasChat = true,
    nodes,
    edges,
  } = props;

  const hasInitialData = !!(nodes && edges);

  const [hasSwitchedRoadmap, setHasSwitchedRoadmap] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [hasError, setHasError] = useState(false);
  const [roadmapData, setRoadmapData] = useState<
    Omit<RoadmapRendererProps, 'resourceId'> | undefined
  >(hasInitialData ? { nodes, edges } : undefined);

  const loadRoadmapData = async () => {
    const { r: switchRoadmapId } = getUrlParams();

    // Skip client fetch if SSR already provided the data (avoids CORS issues on Vercel)
    if (!switchRoadmapId && hasInitialData) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    const { response, error } = await httpGet<
      Omit<RoadmapRendererProps, 'resourceId'>
    >(
      `${import.meta.env.PUBLIC_API_URL}/v1-official-roadmap/${switchRoadmapId || resourceId}`,
    );

    if (error) {
      console.error(error);
      setIsLoading(false);
      setHasError(true);
      return;
    }

    setRoadmapData(response);
    setIsLoading(false);
    setHasSwitchedRoadmap(!!switchRoadmapId);
  };

  useEffect(() => {
    clearMigratedRoadmapProgress(resourceType, resourceId);
    loadRoadmapData().finally();
  }, [resourceId]);

  const aspectRatio = dimensions.width / dimensions.height;

  if (!roadmapData || isLoading) {
    return (
      <div
        style={
          !hasSwitchedRoadmap
            ? ({
                '--aspect-ratio': aspectRatio,
              } as CSSProperties)
            : undefined
        }
        className={
          'mt-5 flex aspect-[var(--aspect-ratio)] w-full flex-col justify-center'
        }
      >
        <div className="flex w-full justify-center">
          {hasError ? (
            <p className="text-sm text-red-500">
              Failed to load roadmap. Please try again later.
            </p>
          ) : (
            <Spinner
              className="h-6 w-6 animate-spin sm:h-12 sm:w-12"
              isDualRing={false}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={
        !hasSwitchedRoadmap
          ? ({
              '--aspect-ratio': aspectRatio,
            } as CSSProperties)
          : undefined
      }
      className={
        'mt-5 flex aspect-[var(--aspect-ratio)] w-full flex-col justify-center'
      }
    >
      <EditorRoadmapRenderer
        {...roadmapData}
        dimensions={dimensions}
        resourceId={resourceId}
      />
      {hasChat && <RoadmapFloatingChat roadmapId={resourceId} />}
    </div>
  );
}
