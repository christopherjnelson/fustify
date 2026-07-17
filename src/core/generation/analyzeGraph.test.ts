import { describe, expect, it } from 'vitest';
import { analyzeUndirectedGraph } from './analyzeGraph';

describe('analyzeUndirectedGraph', () => {
  it('detects articulation points and bridges on a known path graph', () => {
    const analysis = analyzeUndirectedGraph(
      ['a', 'b', 'c', 'd'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
      ],
    );
    expect(analysis.connected).toBe(true);
    expect(analysis.articulationNodeIds).toEqual(['b', 'c']);
    expect(analysis.bridgeEdgeKeys).toEqual(['a|b', 'b|c', 'c|d']);
  });

  it('does not classify cycle edges as bridges', () => {
    const analysis = analyzeUndirectedGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    );
    expect(analysis.articulationNodeIds).toEqual([]);
    expect(analysis.bridgeEdgeKeys).toEqual([]);
  });

  it('reports disconnected graphs', () => {
    expect(
      analyzeUndirectedGraph(['a', 'b', 'c'], [{ from: 'a', to: 'b' }])
        .connected,
    ).toBe(false);
  });
});
