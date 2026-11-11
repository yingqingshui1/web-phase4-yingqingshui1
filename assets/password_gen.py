#!/usr/bin/env python3
"""命令行随机密码生成器。

用途
----
根据指定的长度和字符集，使用标准库 ``secrets`` 生成密码学安全的随机
密码，并把结果输出到标准输出。

用法
----
::

    python password_gen.py --length <正整数> [--charset {letters,digits,alnum,all}]

* ``--length``：必填，密码长度（大于 0 且不超过 :data:`MAX_LENGTH`）。
* ``--charset``：可选，默认 ``all``。各取值含义：
    * ``letters``：仅英文字母，且大小写字母都至少出现一次；
    * ``digits``：仅数字 ``0-9``；
    * ``alnum``：英文字母与数字，大写、小写、数字都至少出现一次；
    * ``all``：英文字母、数字与符号，四类都至少出现一次。

输出与退出码
------------
* 成功：标准输出打印一行密码并换行，退出码 ``0``。
* 失败：标准输出不输出任何内容，标准错误输出一行
  ``错误: <具体原因>``，退出码 ``2``；参数非法（缺参、类型错误、
  取值不在可选范围）由 ``argparse`` 直接报用法错误，退出码同为 ``2``。

长度上限
--------
为避免超长输入导致长时间无响应和内存持续增长，密码长度上限为
:data:`MAX_LENGTH`（1000000）。超过上限时按失败处理：只向标准错误
输出一行错误信息，退出码 ``2``，不生成密码。
"""

from __future__ import annotations

import argparse
import secrets
import string
import sys
from collections.abc import Sequence

# 固定的符号集合，仅用于 all 字符集
SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?/"

# 字符类别名称，仅用于错误提示文案
UPPER_NAME = "大写字母"
LOWER_NAME = "小写字母"
DIGIT_NAME = "数字"
SYMBOL_NAME = "符号"

# 每个字符集由若干"类别"组成：(类别名称, 该类别可用字符)
# 生成密码时每个类别至少要取一个字符，因此各类别数量决定最小长度。
CATEGORIES: dict[str, tuple[tuple[str, str], ...]] = {
    "letters": (
        (UPPER_NAME, string.ascii_uppercase),
        (LOWER_NAME, string.ascii_lowercase),
    ),
    "digits": ((DIGIT_NAME, string.digits),),
    "alnum": (
        (UPPER_NAME, string.ascii_uppercase),
        (LOWER_NAME, string.ascii_lowercase),
        (DIGIT_NAME, string.digits),
    ),
    "all": (
        (UPPER_NAME, string.ascii_uppercase),
        (LOWER_NAME, string.ascii_lowercase),
        (DIGIT_NAME, string.digits),
        (SYMBOL_NAME, SYMBOLS),
    ),
}

# argparse 的可选值列表；使用固定顺序，便于 --help 展示
CHARSET_CHOICES = ("letters", "digits", "alnum", "all")

# 密码长度上限：超长输入需要逐字符随机选取，会长时间占用 CPU 并让内存
# 持续增长，因此在生成密码之前就直接拒绝
MAX_LENGTH = 1_000_000


class PasswordError(ValueError):
    """密码生成过程中的业务错误。

    由 :func:`main` 捕获，转换为一行中文错误信息写往标准错误。
    """


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """解析命令行参数。

    :param argv: 参数列表（不含程序名）；为 ``None`` 时取 ``sys.argv[1:]``。
    :return: 含 ``length`` 与 ``charset`` 属性的命名空间。
    :raises SystemExit: 参数缺失、类型错误或取值非法时，``argparse``
        会打印用法错误到标准错误并以退出码 2 终止进程。
    """
    parser = argparse.ArgumentParser(
        prog="password_gen.py",
        description="生成随机密码（使用标准库 secrets，密码学安全）。",
    )
    parser.add_argument(
        "--length",
        type=int,
        required=True,
        metavar="<正整数>",
        help=f"密码长度，必须是大于 0 且不超过 {MAX_LENGTH} 的整数。",
    )
    parser.add_argument(
        "--charset",
        choices=CHARSET_CHOICES,
        default="all",
        help=(
            "字符集：letters（大小写字母）、digits（数字）、"
            "alnum（字母+数字）、all（字母+数字+符号，默认）。"
        ),
    )
    return parser.parse_args(argv)


def build_categories(charset: str) -> tuple[tuple[str, str], ...]:
    """取得指定字符集对应的类别列表。

    :param charset: 字符集名称，必须是 :data:`CHARSET_CHOICES` 中的值。
    :return: 形如 ``((类别名称, 字符集合), ...)`` 的元组。
    :raises PasswordError: 字符集名称未知时抛出（正常流程下已被
        ``argparse`` 的 ``choices`` 拦截，此处作为兜底）。
    """
    categories = CATEGORIES.get(charset)
    if categories is None:
        raise PasswordError(f"不支持的字符集：{charset}")
    return categories


def validate_length(
    length: int,
    categories: tuple[tuple[str, str], ...],
) -> None:
    """校验密码长度是否可用。

    长度必须为正、不超过 :data:`MAX_LENGTH`，且不小于已启用类别的
    数量，否则无法满足"每个类别至少出现一次"的约束。

    :param length: 用户请求的密码长度。
    :param categories: :func:`build_categories` 返回的类别列表。
    :raises PasswordError: 长度不大于 0、超过上限，或小于类别数量时抛出。
    """
    # 长度必须为正整数
    if length <= 0:
        raise PasswordError(f"密码长度必须大于 0，当前为 {length}")

    # 长度上限：超长输入会让逐字符随机选取长时间无响应并持续占用内存，
    # 因此在真正生成之前就拒绝
    if length > MAX_LENGTH:
        raise PasswordError(
            f"密码长度不能超过 {MAX_LENGTH}，当前为 {length}"
        )

    required = len(categories)
    # 长度不足以覆盖每个类别时直接拒绝，绝不通过截断或补字符绕过约束
    if length < required:
        names = "、".join(name for name, _ in categories)
        raise PasswordError(
            f"密码长度不足：当前字符集需要 {required} 个类别"
            f"（{names}），长度至少为 {required}，当前为 {length}"
        )


def generate_password(length: int, charset: str) -> str:
    """生成满足类别约束的随机密码。

    做法是：先给每个类别各取一个字符，再用全部已启用字符填满剩余
    位置，最后整体打乱，避免类别字符总落在固定位置。

    :param length: 密码长度，需通过 :func:`validate_length` 校验。
    :param charset: 字符集名称。
    :return: 长度为 ``length`` 的密码字符串。
    :raises PasswordError: 长度或字符集不合法时抛出。
    """
    categories = build_categories(charset)
    validate_length(length, categories)

    # 使用 secrets.SystemRandom() 仅为获取 shuffle 能力，
    # 单个字符的选取统一走 secrets.choice，不使用 random 模块。
    rng = secrets.SystemRandom()

    # 第一步：每个类别各取一个字符，保证"每类至少一个"
    chars = [secrets.choice(pool) for _, pool in categories]

    # 第二步：剩余位置从全部已启用字符中随机选取
    merged = "".join(pool for _, pool in categories)
    chars.extend(secrets.choice(merged) for _ in range(length - len(chars)))

    # 第三步：整体洗牌，打乱类别字符的位置分布
    rng.shuffle(chars)

    return "".join(chars)


def main(argv: Sequence[str] | None = None) -> int:
    """程序入口：解析参数、生成密码并输出。

    :param argv: 参数列表（不含程序名）；为 ``None`` 时取 ``sys.argv[1:]``。
    :return: 进程退出码，成功为 ``0``，校验失败为 ``2``。
    """
    args = parse_args(argv)
    try:
        password = generate_password(args.length, args.charset)
    except PasswordError as exc:
        # 失败时标准输出保持为空，仅向标准错误写一行中文错误信息
        print(f"错误: {exc}", file=sys.stderr)
        return 2

    # 成功时只输出一行密码
    print(password)
    return 0


if __name__ == "__main__":
    sys.exit(main())
