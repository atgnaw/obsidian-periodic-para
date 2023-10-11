import type { App, MarkdownPostProcessorContext } from 'obsidian';
import type { TaskConditionType, PluginSettings } from '../type';
import type { TaskResult } from 'obsidian-dataview/lib/api/plugin-api';

import { TaskStatusType } from '../type';
import { moment } from 'obsidian';
import { DataviewApi, STask } from 'obsidian-dataview';
import { ERROR_MESSAGES } from '../constant';

import { File } from '../periodic/File';
import { Date } from '../periodic/Date';
import { Markdown } from '../component/Markdown';
import { renderError } from '../util';

export class Task {
  app: App;
  date: Date;
  dataview: DataviewApi;
  settings: PluginSettings;
  file: File;
  constructor(app: App, settings: PluginSettings, dataview: DataviewApi) {
    this.app = app;
    this.settings = settings;
    this.dataview = dataview;
    this.file = new File(this.app, this.settings, this.dataview);
    this.date = new Date(this.app, this.settings, this.file);
  }

  doneListByTime = (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    const filename = ctx.sourcePath;
    const parsed = this.date.parse(filename);
    const condition = this.date.days(parsed);

    if (condition.from === null && condition.to === null) {
      return;
    }

    const tasks = this.dataview
      .pages('')
      .file.tasks.where((t: STask) =>
        this.filter(t, {
          date: TaskStatusType.DONE,
          ...condition,
        })
      )
      .sort((t: STask) => t.completion, 'asc');

    const div = el.createEl('div');
    const component = new Markdown(div);

    this.dataview.taskList(tasks, false, div, component);

    ctx.addChild(component);
  };

  recordListByTime = (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    const filename = ctx.sourcePath;
    const parsed = this.date.parse(filename);
    const condition = this.date.days(parsed);

    if (condition.from === null && condition.to === null) {
      return;
    }

    let tasks = [];
    // 收集日期范围内的日记文件
    const dailyTasks = this.dataview.pages('').file.tasks.where((t: STask) =>//
      this.filter(t, { //filter函数限定了只在日记文件中搜索：对任务所在文件的章节进行判断（所以这基本导致了只会搜索出日记部分的任务列表）
        date: TaskStatusType.RECORD,
        ...condition,   //from, to
      })
    );

    tasks = [...dailyTasks];

    // 收集日期范围内的非日记文件
    const files = this.date.files(parsed); //获取指定日期范围内的 weeks，quarters 和 months，
    const pages = Object.values(files).flat(); // 二维数组转一维数组

    if (pages.length) {
      const nonDailyTasks = this.dataview
        .pages(`"${pages.join('" or "')}"`)
        .file.tasks.where((task: STask) => task);

      tasks = [...dailyTasks, ...nonDailyTasks];
    }

    const div = el.createEl('div');
    const component = new Markdown(div);

    this.dataview.taskList(tasks, false, div, component);

    ctx.addChild(component);
  };

  listByTag = async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    const filepath = ctx.sourcePath;
    const tags = this.file.tags(filepath); // 获取文件的 tags
    const div = el.createEl('div');
    const component = new Markdown(div);

    if (!tags.length) {
      return renderError(
        ERROR_MESSAGES.NO_FRONT_MATTER_TAG,
        div,
        filepath
      );
    }

    const where = tags
      .map((tag: string[], index: number) => {
        return `contains(tags, "#${tag}") ${
          index === tags.length - 1 ? '' : 'OR'
        }`; //e.g. contains(tags, "#work") OR contains(tags, "#life")
      })
      .join(' ');

    //FROM -"Templates"  为否定来源
    const { values: tasks } = (await this.dataview.tryQuery(` 
    TASK
    FROM -"Templates" 
    WHERE ${where} AND file.path != "${filepath}"
    SORT completed ASC
    `)) as TaskResult;

    this.dataview.taskList(tasks, false, div, component);

    ctx.addChild(component);
  };

  /**
   * @param task 
   * @param condition 
   * @returns 
   * @description 过滤任务
   * 1. 传入任务本身，传入查询任务类型，和查询日期范围
   * 2. 返回传入的任务是否符合查询条件
   */
  filter(
    task: STask,
    condition: TaskConditionType = {
      date: TaskStatusType.DONE,
    }
  ): boolean {
    const { date = TaskStatusType.DONE, from, to } = condition;

    if (!task) return false;
  
    if (!from && !to) return false;

    if (
      task?.section?.type === 'header' &&
      task?.section?.subpath?.trim() === this.settings.habitHeader.trim() //对任务所在的文件章节进行判断（所以这导致只会搜索出日记部分的任务列表）
    )
      return false;

    let dateText = '';

    if (date === TaskStatusType.DONE) {
      // filter by done date
      const ret = task?.text.match(/✅ (\d\d\d\d-\d\d-\d\d)/);
      

      if (!ret) return false;
      dateText = ret[1];
    } else if (date === TaskStatusType.RECORD) {
      // filter by record date
      const ret = task?.path.match(/\d\d\d\d-\d\d-\d\d/);

      if (!ret) return false;

      dateText = ret[0];
    }

    const targetDate = moment(dateText);

    if (!targetDate) return false;

    const isFromFullfil = from ? targetDate.isSameOrAfter(moment(from)) : true;
    const isToFullfil = to ? targetDate.isSameOrBefore(moment(to)) : true;

    const isFullfil =
      task.children
        .map((subtask: STask) => this.filter(subtask, condition))
        .includes(true) ||
      (task.text.length > 1 &&
        ((date === TaskStatusType.DONE && task.completed) ||
          date === TaskStatusType.RECORD) &&
        isFromFullfil &&
        isToFullfil);

    return isFullfil;
  }
}
