import { Component, ElementRef, afterNextRender, effect, inject, input, output, type OnDestroy } from '@angular/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ComposeOption, type ECharts } from 'echarts/core';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts';
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

// Only what the dashboard uses is bundled (tree-shaken ECharts core).
use([PieChart, BarChart, LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export type ChartOption = ComposeOption<PieSeriesOption | BarSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption>;

/**
 * Thin ECharts host. The caller builds the option (so colours and labels stay
 * in one place) and receives the clicked item's `key` for drill-down. The
 * chart is decorative for screen readers: `label` names it, and every chart
 * sits next to a legend list with the same values as links.
 */
@Component({
  selector: 'app-chart',
  template: '',
  styles: [':host { display: block; width: 100%; height: 100%; min-height: 160px; }'],
  host: { role: 'img', '[attr.aria-label]': 'label()' },
})
export class ChartComponent implements OnDestroy {
  readonly option = input.required<ChartOption>();
  readonly label = input.required<string>();
  /** Emits the `key` stored on the clicked data item. */
  readonly pick = output<string>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private chart: ECharts | null = null;
  private resize: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      // Ionic renders pages hidden during transitions: start once the host has a size.
      this.resize = new ResizeObserver(() => {
        const el = this.el.nativeElement;
        if (!el.clientWidth || !el.clientHeight) return;
        if (this.chart) return this.chart.resize();
        this.chart = init(el, null, { renderer: 'svg' });
        this.chart.on('click', (e) => {
          const key = (e.data as { key?: string } | undefined)?.key;
          if (key) this.pick.emit(key);
        });
        this.chart.setOption(this.option(), true);
      });
      this.resize.observe(this.el.nativeElement);
    });
    effect(() => {
      const o = this.option();
      this.chart?.setOption(o, true);
    });
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.chart?.dispose();
  }
}
