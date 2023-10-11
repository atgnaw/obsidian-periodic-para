import type { TaskConditionType } from '../type';

import { TFile, moment } from 'obsidian';
import { Date } from '../periodic/Date';
import { Markdown } from '../component/Markdown'
import {
  MarkdownPostProcessorContext,
  MarkdownRenderer,
} from 'obsidian';
import { Item } from './Item';

export class Project extends Item {
  timeAdd(timeString1: string, timeString2: string) {
    if (!timeString1) {
      return timeString2;
    }

    if (!timeString2) {
      return timeString1;
    }

    const reg = /(\d+)hr(\d+)?/;
    const [, hr1 = 0, min1 = 0] = timeString1.match(reg) || [];
    const [, hr2 = 0, min2 = 0] = timeString2.match(reg) || [];
    let carry = 0;
    const hr = Number(hr1) + Number(hr2);
    let min = Number(min1) + Number(min2);

    if (min >= 60) {
      carry = Number((min / 60).toFixed(0));
      min = min % 60;
    }

    return `${hr + carry}hr${min}`;
  }

  timePercent(timeString1: string, timeString2: string) {
    if (!timeString1) {
      return '';
    }

    if (!timeString2) {
      return '';
    }

    const reg = /(\d+)hr(\d+)?/;
    const [, hr1 = 0, min1 = 0] = timeString1.match(reg) || [];
    const [, hr2 = 0, min2 = 0] = timeString2.match(reg) || [];
    const time1 = Number(hr1) * 60 + Number(min1);
    const time2 = Number(hr2) * 60 + Number(min2);

    return ((time1 / time2) * 100).toFixed(2) + '%';
  }

  async filter(
    condition: TaskConditionType = {
      from: '',
      to: '',
    },
    header: string,
  ) {
    const { from, to } = condition;
    const timeReg = /\d+hr(\d+)?/;
    let day = from;
    const projectList: string[] = [];
    const projectTimeConsume: Record<string, string> = {};
    let totalTime = '';
    const tasks = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const momentDay = moment(day);
      const link = `${momentDay.format('YYYY-MM-DD')}.md`;
      const file = this.file.get(link, '', this.settings.periodicNotesPath);

      if (file instanceof TFile) {
        const reg = new RegExp(`# ${header}([\\s\\S]+?)\n#`);

        let todayTotalTime = '0hr0';
        tasks.push(async () => {
          const fileContent = await this.app.vault.read(file);
          const regMatch = fileContent.match(reg);
          const projectContent = regMatch?.length
            ? regMatch[1]?.split('\n')
            : [];

          projectContent.map((project) => {
            if (!project) {
              return;
            }

            if (project.match(timeReg)) {
              // 特殊处理总耗时
              todayTotalTime = project;
            }
            // 1. [[WOT.README|分享-2023 WOT 分享会]] 4hr20
            // 1. [[1. Projects/分享-2023 WOT 分享会/README|分享-2023 WOT 分享会]]  4hr20
            const realProject = (project.match(/\[\[(.*)\|?(.*)\]\]/) ||
              [])[1]?.replace(/\|.*/, '');

            if (!realProject) {
              return;
            }

            const projectFile =
              this.file.get(realProject)
                ?.path || '';
            const [projectTime = ''] = project.match(timeReg) || [];

            projectTimeConsume[projectFile] = this.timeAdd(
              projectTimeConsume[projectFile],
              projectTime
            );

            if (!projectList.includes(projectFile)) {
              projectList.push(projectFile);
            }
          });

          totalTime = this.timeAdd(totalTime, todayTotalTime);
        });
      }

      if (day === to) {
        break;
      }

      day = momentDay.add(1, 'day').format('YYYY-MM-DD');
    }

    await Promise.all(tasks.map((task) => task()));
    Object.keys(projectTimeConsume).map((project) => {
      projectTimeConsume[project] = projectTimeConsume[project]
        ? `${projectTimeConsume[project]}/${totalTime}=${this.timePercent(
            projectTimeConsume[project],
            totalTime
          )}`
        : '';
    });

    return {
      projectList,
      projectTimeConsume,
      totalTime,
    };
  }

  listByTime = async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    const date = new Date(this.app, this.settings, this.file);
    const parsed = date.days(date.parse(ctx.sourcePath));

    const header = this.settings.projectListHeader;
    const { projectList, projectTimeConsume } = await this.filter(
      parsed,
      header,
    );

    const div = el.createEl('div');
    const list: string[] = [];

    projectList.map((project: string, index: number) => {
      // WOT.README
      // 1. Projects/分享-2023 WOT 分享会/README
      const regMatch = project.match(/\/(.*)\//);// 正则表达式：匹配两个斜杠之间的内容

      list.push(
        `${index + 1}. [[${project}|${regMatch?.length ? regMatch[1] : ''}]] ${
          projectTimeConsume[project]
        }`
      );
    });

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
