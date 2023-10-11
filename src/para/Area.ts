import type { MarkdownPostProcessorContext } from 'obsidian';
import type { DateType } from '../type';

import { MarkdownRenderer, TFile } from 'obsidian';
import { Item } from './Item';
import { Markdown } from '../component/Markdown'

export class Area extends Item {
  async filter(
    condition: DateType = {
      year: null,
      month: null,
      quarter: null,
      week: null,
      day: null,
    },
    header: string
  ) {
    const { year } = condition;
    const quarterList = ['Q1', 'Q2', 'Q3', 'Q4'];
    const areaList: string[] = [];
    const tasks = [];

    for (let index = 0; index < quarterList.length; index++) {
      const quarter = quarterList[index];
      const link = `${year}-${quarter}.md`;
      const file = this.file.get(link, '', this.settings.periodicNotesPath);

      if (file instanceof TFile) {
        const reg = new RegExp(`# ${header}([\\s\\S]+?)\n#`); //正则表达式：匹配# header内容 #之间的内容

        if (file) {
          tasks.push(async () => {
            const fileContent = await this.app.vault.read(file);
            const regMatch = fileContent.match(reg);
            const areaContent = regMatch?.length
              ? regMatch[1]?.split('\n')
              : [];
            areaContent.map((area) => {
              if (!area) {
                return;
              }

              const realArea = (area.match(/\[\[(.*)\|?(.*)\]\]/) ||
                [])[1]?.replace(/\|.*/, '');
              if (realArea && !areaList.includes(realArea)) {
                areaList.push(realArea);
              }
            });
          });
        }
      }
    }

    await Promise.all(tasks.map((task) => task()));

    return areaList;
  }
  //文档中的插件代码块渲染
  listByTime = async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    const filename = ctx.sourcePath;
    const parsed = this.date.parse(filename);

    const header = this.settings.areaListHeader;
    const areaList = await this.filter(parsed, header);
    const div = el.createEl('div');
    const list: string[] = [];

    areaList.map((area: string, index: number) => {
      const file = this.file.get(area);

      const regMatch = file?.path.match(/\/(.*)\//);

      list.push(
        `${index + 1}. [[${area}|${regMatch?.length ? regMatch[1] : ''}]]`
      );
    });
////////////////////////////////////////////////////
    const component = new Markdown(div);

    MarkdownRenderer.renderMarkdown(
      list.join('\n'),
      div,
      ctx.sourcePath,
      component
    );

    ctx.addChild(component);
  };
}
