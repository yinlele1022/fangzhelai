(function (global) {
  "use strict";

  const EASY_MODE_TAGS = ["single_level_1", "challenge_warmup", "shadow_challenge"];
  const logicOptions = [
    { id: "btn_true", label: "对" },
    { id: "btn_false", label: "错" },
  ];

  function makeQuestion(id, type, prompt, correctAction, options, trap, level = 1) {
    return {
      id,
      type,
      difficulty: "easy",
      difficultyLevel: level,
      prompt,
      fontColor: "#FFFFFF",
      options: options || null,
      correctAction,
      timeLimit: level === 1 ? 1200 : 1100,
      trap,
      modeTags: EASY_MODE_TAGS,
      implementationLevel: "P0",
    };
  }

  function direction(id, prompt, correctAction, level) {
    return makeQuestion(id, "direction", prompt, correctAction, null, "基础方向反转", level);
  }

  function action(id, prompt, correctAction, level) {
    return makeQuestion(
      id,
      "action",
      prompt,
      correctAction,
      null,
      correctAction === "wait" ? "动作克制" : "动作反转",
      level
    );
  }

  function color(id, prompt, first, second, correctAction, level) {
    return makeQuestion(
      id,
      "color",
      prompt,
      [first, second],
      correctAction,
      "基础颜色反转",
      level
    );
  }

  function logic(id, prompt, correctAction, level) {
    return makeQuestion(
      id,
      "logic_reversal",
      prompt,
      correctAction,
      logicOptions,
      "常识反转",
      level
    );
  }

  const directionQuestions = [
    direction("direction_easy_001", "向左滑", "swipe_right"),
    direction("direction_easy_002", "向右滑", "swipe_left"),
    direction("direction_easy_003", "向上滑", "swipe_down"),
    direction("direction_easy_004", "向下滑", "swipe_up"),
    direction("direction_easy_005", "点左边", "click_right"),
    direction("direction_easy_006", "点右边", "click_left"),
    direction("direction_easy_007", "点上面", "click_bottom"),
    direction("direction_easy_008", "点下面", "click_top"),
    direction("direction_easy_009", "往左", "swipe_right"),
    direction("direction_easy_010", "往右", "swipe_left"),
    direction("direction_easy_011", "往上", "swipe_down"),
    direction("direction_easy_012", "往下", "swipe_up"),
    direction("direction_easy_013", "左边按钮", "click_right"),
    direction("direction_easy_014", "右边按钮", "click_left"),
    direction("direction_easy_015", "上面按钮", "click_bottom"),
    direction("direction_easy_016", "下面按钮", "click_top"),
    direction("direction_easy_017", "向左", "swipe_right"),
    direction("direction_easy_018", "向右", "swipe_left"),
    direction("direction_easy_019", "上滑", "swipe_down"),
    direction("direction_easy_020", "下滑", "swipe_up"),
    direction("direction_easy_021", "左边", "click_right"),
    direction("direction_easy_022", "右边", "click_left"),
    direction("direction_easy_023", "上面", "click_bottom"),
    direction("direction_easy_024", "下面", "click_top"),
    direction("direction_easy_025", "往左滑", "swipe_right"),
    direction("direction_easy_026", "往右滑", "swipe_left"),
    direction("direction_easy_027", "往上滑", "swipe_down"),
    direction("direction_easy_028", "往下滑", "swipe_up"),
    direction("direction_easy_029", "点顶部", "click_bottom"),
    direction("direction_easy_030", "点底部", "click_top"),
    direction("direction_easy_031", "点击左侧", "click_right", 2),
    direction("direction_easy_032", "点击右侧", "click_left", 2),
    direction("direction_easy_033", "上方按钮", "click_bottom", 2),
    direction("direction_easy_034", "下方按钮", "click_top", 2),
    direction("direction_easy_035", "向左划", "swipe_right", 2),
  ];

  const actionQuestions = [
    action("action_easy_001", "别点", "tap"),
    action("action_easy_002", "不要点", "tap"),
    action("action_easy_003", "禁止点击", "tap"),
    action("action_easy_004", "快点", "wait"),
    action("action_easy_005", "马上点", "wait"),
    action("action_easy_006", "现在点", "wait"),
    action("action_easy_007", "等一下", "tap"),
    action("action_easy_008", "忍住", "tap"),
    action("action_easy_009", "停下", "tap"),
    action("action_easy_010", "动手", "wait"),
    action("action_easy_011", "别动", "tap"),
    action("action_easy_012", "别按", "tap"),
    action("action_easy_013", "快按", "wait"),
    action("action_easy_014", "立即点击", "wait", 2),
    action("action_easy_015", "立即按下", "wait", 2),
    action("action_easy_016", "禁止按下", "tap", 2),
    action("action_easy_017", "别碰", "tap"),
    action("action_easy_018", "别点按钮", "tap"),
    action("action_easy_019", "快来点", "wait", 2),
    action("action_easy_020", "马上按下", "wait", 2),
    action("action_easy_021", "立刻点", "wait", 2),
    action("action_easy_022", "暂时不要点", "tap"),
    action("action_easy_023", "不要按", "tap"),
    action("action_easy_024", "停止点击", "tap"),
    action("action_easy_025", "请按下", "wait"),
  ];

  const palette = {
    red: { id: "red", label: "红", color: "#FF3D5A" },
    blue: { id: "blue", label: "蓝", color: "#3483FF" },
    black: { id: "black", label: "黑", color: "#111111" },
    white: { id: "white", label: "白", color: "#FFFFFF" },
    yellow: { id: "yellow", label: "黄", color: "#FFD600" },
    purple: { id: "purple", label: "紫", color: "#A855F7" },
    green: { id: "green", label: "绿", color: "#00FF9D" },
    orange: { id: "orange", label: "橙", color: "#FF8A00" },
    cyan: { id: "cyan", label: "青", color: "#00FFC7" },
    pink: { id: "pink", label: "粉", color: "#FF5CB0" },
  };

  const colorQuestions = [
    color("color_easy_001", "点红色", palette.red, palette.blue, "blue"),
    color("color_easy_002", "点蓝色", palette.blue, palette.red, "red"),
    color("color_easy_003", "点黑色", palette.black, palette.white, "white"),
    color("color_easy_004", "点白色", palette.white, palette.black, "black"),
    color("color_easy_005", "点黄色", palette.yellow, palette.purple, "purple"),
    color("color_easy_006", "点紫色", palette.purple, palette.yellow, "yellow"),
    color("color_easy_007", "点绿色", palette.green, palette.orange, "orange"),
    color("color_easy_008", "点橙色", palette.orange, palette.green, "green"),
    color("color_easy_009", "点青色", palette.cyan, palette.pink, "pink"),
    color("color_easy_010", "点粉色", palette.pink, palette.cyan, "cyan"),
    color("color_easy_011", "点红", palette.red, palette.green, "green"),
    color("color_easy_012", "点蓝", palette.blue, palette.yellow, "yellow"),
    color("color_easy_013", "点紫", palette.purple, palette.orange, "orange"),
    color("color_easy_014", "点绿", palette.green, palette.red, "red"),
    color("color_easy_015", "点黄", palette.yellow, palette.blue, "blue"),
    color("color_easy_016", "点粉", palette.pink, palette.cyan, "cyan"),
    color("color_easy_017", "点蓝色按钮", palette.blue, palette.red, "red", 2),
    color("color_easy_018", "点红色按钮", palette.red, palette.blue, "blue", 2),
    color("color_easy_019", "点黑色按钮", palette.black, palette.white, "white", 2),
    color("color_easy_020", "点黄色按钮", palette.yellow, palette.purple, "purple", 2),
    color("color_easy_021", "点绿色按钮", palette.green, palette.orange, "orange", 2),
    color("color_easy_022", "点紫色按钮", palette.purple, palette.yellow, "yellow", 2),
    color("color_easy_023", "点橙色按钮", palette.orange, palette.green, "green", 2),
    color("color_easy_024", "点蓝色方块", palette.blue, palette.red, "red"),
    color("color_easy_025", "点红色方块", palette.red, palette.blue, "blue"),
  ];

  const logicQuestions = [
    logic("logic_reversal_easy_001", "冰是冷的", "btn_false"),
    logic("logic_reversal_easy_002", "火是热的", "btn_false"),
    logic("logic_reversal_easy_003", "水会流动", "btn_false"),
    logic("logic_reversal_easy_004", "太阳会发光", "btn_false"),
    logic("logic_reversal_easy_005", "白天有太阳", "btn_false"),
    logic("logic_reversal_easy_006", "1+1=2", "btn_false"),
    logic("logic_reversal_easy_007", "猫是动物", "btn_false"),
    logic("logic_reversal_easy_008", "鱼会游泳", "btn_false"),
    logic("logic_reversal_easy_009", "雪是白的", "btn_false"),
    logic("logic_reversal_easy_010", "石头很软", "btn_true"),
    logic("logic_reversal_easy_011", "火是冷的", "btn_true"),
    logic("logic_reversal_easy_012", "水是干的", "btn_true"),
    logic("logic_reversal_easy_013", "鸟会游泳", "btn_true"),
    logic("logic_reversal_easy_014", "太阳是方的", "btn_true"),
    logic("logic_reversal_easy_015", "零下很热", "btn_true", 2),
  ];

  const easyQuestions = [
    ...directionQuestions,
    ...actionQuestions,
    ...colorQuestions,
    ...logicQuestions,
  ];

  global.QuestionPoolParts = global.QuestionPoolParts || {};
  global.QuestionPoolParts.easy = easyQuestions;
})(window);
