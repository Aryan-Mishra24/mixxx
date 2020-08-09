///////////////////////////////////////////////////////////////////////////////////
// JSHint configuration                                                          //
///////////////////////////////////////////////////////////////////////////////////
/* global HIDDebug                                                               */
/* global HIDPacket                                                              */
/* global HIDController                                                          */
/* jshint -W016                                                                  */
///////////////////////////////////////////////////////////////////////////////////
/*                                                                               */
/* Traktor Kontrol S3 HID controller script v1.00                                */
/* Last modification: August 2020                                                */
/* Author: Owen Williams                                                         */
/* https://www.mixxx.org/wiki/doku.php/native_instruments_traktor_kontrol_s3     */
/*                                                                               */
///////////////////////////////////////////////////////////////////////////////////
/*                                                                               */
/* TODO:  */
/*   * wheel blink for end of track */
/*   * touch for track browse, loop control, beatjump?                            */
/*   * jog button                                                                */
/*   * star button */
/*                                                                               */
///////////////////////////////////////////////////////////////////////////////////


var TraktorS3 = new function() {
    this.controller = new HIDController();

    // ==== Friendly User Configuration ====
    // The pitch slider can operate either in absolute or relative mode.
    // In absolute mode:
    // * Moving the pitch slider works like normal
    // * Mixxx will use soft-takeover
    // * Pressing shift will adjust musical pitch instead of rate
    // * Keylock toggles on with down-press.
    //
    // In relative mode:
    // * The slider always moves, unless it has hit the end of the range inside Mixxx
    // * No soft-takeover
    // * Hold shift to move the pitch slider without adjusting the rate
    // * Hold keylock and move the pitch slider to adjust musical pitch
    // * keylock will still toggle on, but on release, not press.
    this.pitchSliderRelativeMode = true;

    // State for relative mode
    this.pitchSliderLastValue = {"deck1": -1, "deck2": -1};
    this.keylockPressed = {"deck1": false, "deck2": false};
    this.keyAdjusted = {"deck1": false, "deck2": false};

    // State for other controls.
    this.shiftPressed = {"deck1": false, "deck2": false};
    this.syncPressedTimer = {"deck1": 0, "deck2": 0};
    this.previewPressed = {"deck1": false, "deck2": false};
    // "5" is the "filter" button below the other 4.
    this.fxButtonState = {1: false, 2: false, 3: false, 4: false, 5: true};
    this.fxEnabledState = {
        "[Channel1]": true,
        "[Channel2]": true,
        "[Channel3]": true,
        "[Channel4]": true,
    };
    // 0 = Hotcues Mode, 1 = Samples Mode
    this.padModeState = {"deck1": 0, "deck2": 0};

    // When true, packets will not be sent to the controller.  Good for doing mass updates.
    this.batchingOutputs = false;

    // Active deck switches -- common-hid-packet-parser only has one active deck status per
    // Controller object.
    this.activeDecks = {
        1: true,
        2: true,
        3: false,
        4: false
    };

    // Knob encoder states (hold values between 0x0 and 0xF)
    // Rotate to the right is +1 and to the left is means -1
    this.browseKnobEncoderState = {"deck1": 0, "deck2": 0};
    this.loopKnobEncoderState = {"deck1": 0, "deck2": 0};
    this.moveKnobEncoderState = {"deck1": 0, "deck2": 0};

    // Microphone button
    this.microphonePressedTimer = 0; // Timer to distinguish between short and long press

    // Sync buttons
    this.syncPressedTimer = {"deck1": 0, "deck2": 0}; // Timer to distinguish between short and long press

    // Jog wheels
    // tickReceived is used to detect when the platter has stopped moving.
    this.tickReceived = [false, false];
    this.lastTickVal = [0, 0];
    this.lastTickTime = [0, 0];
    this.wheelTouchInertiaTimer = {
        "[Channel1]": 0,
        "[Channel2]": 0,
        "[Channel3]": 0,
        "[Channel4]": 0
    };

    // VuMeter
    this.vuConnections = {
        "[Channel1]": {},
        "[Channel2]": {},
        "[Channel3]": {},
        "[Channel4]": {},
    };
    this.masterVuConnections = {
        "VuMeterL": {},
        "VuMeterR": {}
    };

    this.clipConnections = {
        "[Channel1]": {},
        "[Channel2]": {},
        "[Channel3]": {},
        "[Channel4]": {}
    };

    // The S3 has a set of predefined colors for many buttons. They are not
    // mapped by RGB, but 16 colors, each with 4 levels of brightness, plus white.
    this.controller.LEDColors = {
        OFF: 0x00,
        RED: 0x04,
        CARROT: 0x08,
        ORANGE: 0x0C,
        HONEY: 0x10,
        YELLOW: 0x14,
        LIME: 0x18,
        GREEN: 0x1C,
        AQUA: 0x20,
        CELESTE: 0x24,
        SKY: 0x28,
        BLUE: 0x2C,
        PURPLE: 0x30,
        FUSCHIA: 0x34,
        MAGENTA: 0x38,
        AZALEA: 0x3C,
        SALMON: 0x40,
        WHITE: 0x44
    };

    // Each color has four brightnesses.
    this.LEDDimValue = 0x00;
    this.LEDBrightValue = 0x02;

    this.controller.deckOutputColors = {
        1: "CARROT",
        2: "CARROT",
        3: "BLUE",
        4: "BLUE"
    };

    this.fxLEDValue = {
        1: this.controller.LEDColors.RED,
        2: this.controller.LEDColors.GREEN,
        3: this.controller.LEDColors.BLUE,
        4: this.controller.LEDColors.YELLOW,
        5: this.controller.LEDColors.PURPLE,
    };

    this.colorMap = new ColorMapper({
        0xCC0000: this.controller.LEDColors.RED,
        0xCC5E00: this.controller.LEDColors.CARROT,
        0xCC7800: this.controller.LEDColors.ORANGE,
        0xCC9200: this.controller.LEDColors.HONEY,

        0xCCCC00: this.controller.LEDColors.YELLOW,
        0x81CC00: this.controller.LEDColors.LIME,
        0x00CC00: this.controller.LEDColors.GREEN,
        0x00CC49: this.controller.LEDColors.AQUA,

        0x00CCCC: this.controller.LEDColors.CELESTE,
        0x0091CC: this.controller.LEDColors.SKY,
        0x0000CC: this.controller.LEDColors.BLUE,
        0xCC00CC: this.controller.LEDColors.PURPLE,

        0xCC0091: this.controller.LEDColors.FUSCHIA,
        0xCC0079: this.controller.LEDColors.MAGENTA,
        0xCC477E: this.controller.LEDColors.AZALEA,
        0xCC4761: this.controller.LEDColors.SALMON,

        0xCCCCCC: this.controller.LEDColors.WHITE,
    });

    // Sampler callbacks
    this.samplerCallbacks = [];
};

TraktorS3.registerInputPackets = function() {
    var messageShort = new HIDPacket("shortmessage", 0x01, this.messageCallback);
    var messageLong = new HIDPacket("longmessage", 0x02, this.messageCallback);

    this.registerInputButton(messageShort, "[Channel1]", "!switchDeck", 0x02, 0x02, this.deckSwitchHandler);
    this.registerInputButton(messageShort, "[Channel2]", "!switchDeck", 0x05, 0x04, this.deckSwitchHandler);
    this.registerInputButton(messageShort, "[Channel3]", "!switchDeck", 0x02, 0x04, this.deckSwitchHandler);
    this.registerInputButton(messageShort, "[Channel4]", "!switchDeck", 0x05, 0x08, this.deckSwitchHandler);

    this.registerInputButton(messageShort, "deck1", "!play", 0x03, 0x01, this.playHandler);
    this.registerInputButton(messageShort, "deck2", "!play", 0x06, 0x02, this.playHandler);

    this.registerInputButton(messageShort, "deck1", "!cue_default", 0x02, 0x80, this.cueHandler);
    this.registerInputButton(messageShort, "deck2", "!cue_default", 0x06, 0x01, this.cueHandler);

    this.registerInputButton(messageShort, "deck1", "!shift", 0x01, 0x01, this.shiftHandler);
    this.registerInputButton(messageShort, "deck2", "!shift", 0x04, 0x02, this.shiftHandler);

    this.registerInputButton(messageShort, "deck1", "!sync", 0x02, 0x08, this.syncHandler);
    this.registerInputButton(messageShort, "deck2", "!sync", 0x05, 0x10, this.syncHandler);

    this.registerInputButton(messageShort, "deck1", "!keylock", 0x02, 0x10, this.keylockHandler);
    this.registerInputButton(messageShort, "deck2", "!keylock", 0x05, 0x20, this.keylockHandler);

    this.registerInputButton(messageShort, "deck1", "!hotcues", 0x02, 0x20, this.padModeHandler);
    this.registerInputButton(messageShort, "deck2", "!hotcues", 0x05, 0x40, this.padModeHandler);

    this.registerInputButton(messageShort, "deck1", "!samples", 0x02, 0x40, this.padModeHandler);
    this.registerInputButton(messageShort, "deck2", "!samples", 0x05, 0x80, this.padModeHandler);

    // // Number pad buttons (Hotcues or Samplers depending on current mode)
    this.registerInputButton(messageShort, "deck1", "!pad_1", 0x03, 0x02, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck1", "!pad_2", 0x03, 0x04, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck1", "!pad_3", 0x03, 0x08, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck1", "!pad_4", 0x03, 0x10, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck1", "!pad_5", 0x03, 0x20, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck1", "!pad_6", 0x03, 0x40, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck1", "!pad_7", 0x03, 0x80, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck1", "!pad_8", 0x04, 0x01, this.numberButtonHandler);

    this.registerInputButton(messageShort, "deck2", "!pad_1", 0x06, 0x04, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck2", "!pad_2", 0x06, 0x08, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck2", "!pad_3", 0x06, 0x10, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck2", "!pad_4", 0x06, 0x20, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck2", "!pad_5", 0x06, 0x40, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck2", "!pad_6", 0x06, 0x80, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck2", "!pad_7", 0x07, 0x01, this.numberButtonHandler);
    this.registerInputButton(messageShort, "deck2", "!pad_8", 0x07, 0x02, this.numberButtonHandler);

    // // Headphone buttons
    this.registerInputButton(messageShort, "[Channel1]", "!pfl", 0x08, 0x01, this.headphoneHandler);
    this.registerInputButton(messageShort, "[Channel2]", "!pfl", 0x08, 0x02, this.headphoneHandler);
    this.registerInputButton(messageShort, "[Channel3]", "!pfl", 0x07, 0x80, this.headphoneHandler);
    this.registerInputButton(messageShort, "[Channel4]", "!pfl", 0x08, 0x04, this.headphoneHandler);

    // // Track browsing
    // TODO: bind touch: 0x09/0x40, 0x0A/0x02
    this.registerInputButton(messageShort, "deck1", "!SelectTrack", 0x0B, 0x0F, this.selectTrackHandler);
    this.registerInputButton(messageShort, "deck2", "!SelectTrack", 0x0C, 0xF0, this.selectTrackHandler);
    this.registerInputButton(messageShort, "deck1", "!LoadSelectedTrack", 0x09, 0x01, this.loadTrackHandler);
    this.registerInputButton(messageShort, "deck2", "!LoadSelectedTrack", 0x09, 0x08, this.loadTrackHandler);

    this.registerInputButton(messageShort, "deck1", "!PreviewTrack", 0x01, 0x08, this.previewTrackHandler);
    this.registerInputButton(messageShort, "deck2", "!PreviewTrack", 0x04, 0x10, this.previewTrackHandler);

    this.registerInputButton(messageShort, "deck1", "!LibraryFocus", 0x01, 0x40, this.LibraryFocusHandler);
    this.registerInputButton(messageShort, "deck2", "!LibraryFocus", 0x04, 0x80, this.LibraryFocusHandler);

    this.registerInputButton(messageShort, "deck1", "!AddTrack", 0x01, 0x20, this.cueAutoDJHandler);
    this.registerInputButton(messageShort, "deck2", "!AddTrack", 0x04, 0x40, this.cueAutoDJHandler);

    // // Loop control
    // TODO: bind touch detections: 0x0A/0x01, 0x0A/0x08
    this.registerInputButton(messageShort, "deck1", "!SelectLoop", 0x0C, 0x0F, this.selectLoopHandler);
    this.registerInputButton(messageShort, "deck2", "!SelectLoop", 0x0D, 0xF0, this.selectLoopHandler);
    this.registerInputButton(messageShort, "deck1", "!ActivateLoop", 0x09, 0x04, this.activateLoopHandler);
    this.registerInputButton(messageShort, "deck2", "!ActivateLoop", 0x09, 0x20, this.activateLoopHandler);

    // // Beatjump
    // TODO: bind touch detections: 0x09/0x80, 0x0A/0x04
    this.registerInputButton(messageShort, "deck1", "!SelectBeatjump", 0x0B, 0xF0, this.selectBeatjumpHandler);
    this.registerInputButton(messageShort, "deck2", "!SelectBeatjump", 0x0D, 0x0F, this.selectBeatjumpHandler);
    this.registerInputButton(messageShort, "deck1", "!ActivateBeatjump", 0x09, 0x02, this.activateBeatjumpHandler);
    this.registerInputButton(messageShort, "deck2", "!ActivateBeatjump", 0x09, 0x10, this.activateBeatjumpHandler);

    // // There is only one button on the controller, we use to toggle quantization for all channels
    // this.registerInputButton(messageShort, "[Channel1]", "!quantize", 0x06, 0x40, this.quantizeHandler);

    // // Microphone
    // this.registerInputButton(messageShort, "[Microphone]", "!talkover", 0x06, 0x80, this.microphoneHandler);

    // // Jog wheels
    this.registerInputButton(messageShort, "deck1", "!jog_touch", 0x0A, 0x10, this.jogTouchHandler);
    this.registerInputButton(messageShort, "deck2", "!jog_touch", 0x0A, 0x20, this.jogTouchHandler);
    this.registerInputJog(messageShort, "deck1", "!jog", 0x0E, 0xFFFFFFFF, this.jogHandler);
    this.registerInputJog(messageShort, "deck2", "!jog", 0x12, 0xFFFFFFFF, this.jogHandler);

    // // FX Buttons
    this.registerInputButton(messageShort, "[ChannelX]", "!fx1", 0x08, 0x08, this.fxHandler);
    this.registerInputButton(messageShort, "[ChannelX]", "!fx2", 0x08, 0x10, this.fxHandler);
    this.registerInputButton(messageShort, "[ChannelX]", "!fx3", 0x08, 0x20, this.fxHandler);
    this.registerInputButton(messageShort, "[ChannelX]", "!fx4", 0x08, 0x40, this.fxHandler);
    this.registerInputButton(messageShort, "[ChannelX]", "!fx5", 0x08, 0x80, this.fxHandler);

    this.registerInputButton(messageShort, "[Channel3]", "!fxEnabled", 0x07, 0x08, this.fxEnableHandler);
    this.registerInputButton(messageShort, "[Channel1]", "!fxEnabled", 0x07, 0x10, this.fxEnableHandler);
    this.registerInputButton(messageShort, "[Channel2]", "!fxEnabled", 0x07, 0x20, this.fxEnableHandler);
    this.registerInputButton(messageShort, "[Channel4]", "!fxEnabled", 0x07, 0x48, this.fxEnableHandler);

    // // Rev / FLUX / GRID
    this.registerInputButton(messageShort, "deck1", "!reverse", 0x01, 0x04, this.reverseHandler);
    this.registerInputButton(messageShort, "deck2", "!reverse", 0x04, 0x08, this.reverseHandler);

    this.registerInputButton(messageShort, "deck1", "!slip_enabled", 0x01, 0x02, this.fluxHandler);
    this.registerInputButton(messageShort, "deck2", "!slip_enabled", 0x04, 0x04, this.fluxHandler);

    this.registerInputButton(messageShort, "deck1", "quantize", 0x01, 0x80, this.quantizeHandler);
    this.registerInputButton(messageShort, "deck2", "quantize", 0x05, 0x01, this.quantizeHandler);

    this.controller.registerInputPacket(messageShort);

    this.registerInputScaler(messageLong, "deck1", "rate", 0x01, 0xFFFF, this.pitchSliderHandler);
    this.registerInputScaler(messageLong, "deck2", "rate", 0x0D, 0xFFFF, this.pitchSliderHandler);

    this.registerInputScaler(messageLong, "[Channel1]", "volume", 0x05, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Channel2]", "volume", 0x07, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Channel3]", "volume", 0x03, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Channel4]", "volume", 0x09, 0xFFFF, this.parameterHandler);

    this.registerInputScaler(messageLong, "[Channel1]", "pregain", 0x11, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Channel2]", "pregain", 0x13, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Channel3]", "pregain", 0x0F, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Channel4]", "pregain", 0x15, 0xFFFF, this.parameterHandler);

    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel1]_Effect1]", "parameter3", 0x25, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel1]_Effect1]", "parameter2", 0x27, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel1]_Effect1]", "parameter1", 0x29, 0xFFFF, this.parameterHandler);

    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel2]_Effect1]", "parameter3", 0x2B, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel2]_Effect1]", "parameter2", 0x2D, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel2]_Effect1]", "parameter1", 0x2F, 0xFFFF, this.parameterHandler);

    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel3]_Effect1]", "parameter3", 0x1F, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel3]_Effect1]", "parameter2", 0x21, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel3]_Effect1]", "parameter1", 0x23, 0xFFFF, this.parameterHandler);

    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel4]_Effect1]", "parameter3", 0x31, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel4]_Effect1]", "parameter2", 0x33, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[EqualizerRack1_[Channel4]_Effect1]", "parameter1", 0x35, 0xFFFF, this.parameterHandler);

    this.registerInputScaler(messageLong, "[Channel1]", "!super", 0x39, 0xFFFF, this.superHandler);
    this.registerInputScaler(messageLong, "[Channel2]", "!super", 0x3B, 0xFFFF, this.superHandler);
    this.registerInputScaler(messageLong, "[Channel3]", "!super", 0x37, 0xFFFF, this.superHandler);
    this.registerInputScaler(messageLong, "[Channel4]", "!super", 0x3D, 0xFFFF, this.superHandler);

    this.registerInputScaler(messageLong, "[Master]", "crossfader", 0x0B, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Master]", "gain", 0x17, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Master]", "headMix", 0x1D, 0xFFFF, this.parameterHandler);
    this.registerInputScaler(messageLong, "[Master]", "headGain", 0x1B, 0xFFFF, this.parameterHandler);

    this.controller.registerInputPacket(messageLong);

    // Soft takeover for all knobs
    for (var ch = 1; ch <= 4; ch++) {
        var group = "[Channel" + ch + "]";
        if (!TraktorS3.pitchSliderRelativeMode) {
            engine.softTakeover(group, "rate", true);
        }
        engine.softTakeover(group, "pitch_adjust", true);
        engine.softTakeover(group, "volume", true);
        engine.softTakeover(group, "pregain", true);
        engine.softTakeover(group, "pregain", true);
        engine.softTakeover("[QuickEffectRack1_" +group + "]", "super1", true);
    }

    engine.softTakeover("[EqualizerRack1_[Channel1]_Effect1]", "parameter1", true);
    engine.softTakeover("[EqualizerRack1_[Channel1]_Effect1]", "parameter2", true);
    engine.softTakeover("[EqualizerRack1_[Channel1]_Effect1]", "parameter3", true);
    engine.softTakeover("[EqualizerRack1_[Channel2]_Effect1]", "parameter1", true);
    engine.softTakeover("[EqualizerRack1_[Channel2]_Effect1]", "parameter2", true);
    engine.softTakeover("[EqualizerRack1_[Channel2]_Effect1]", "parameter3", true);
    engine.softTakeover("[EqualizerRack1_[Channel3]_Effect1]", "parameter1", true);
    engine.softTakeover("[EqualizerRack1_[Channel3]_Effect1]", "parameter2", true);
    engine.softTakeover("[EqualizerRack1_[Channel3]_Effect1]", "parameter3", true);
    engine.softTakeover("[EqualizerRack1_[Channel4]_Effect1]", "parameter1", true);
    engine.softTakeover("[EqualizerRack1_[Channel4]_Effect1]", "parameter2", true);
    engine.softTakeover("[EqualizerRack1_[Channel4]_Effect1]", "parameter3", true);

    engine.softTakeover("[Master]", "crossfader", true);
    engine.softTakeover("[Master]", "gain", true);
    engine.softTakeover("[Master]", "headMix", true);
    engine.softTakeover("[Master]", "headGain", true);

    for (var i = 1; i <= 16; ++i) {
        engine.softTakeover("[Sampler" + i + "]", "pregain", true);
    }

    engine.connectControl("[Channel1]", "playposition", TraktorS3.spinnyAngleChanged);
    engine.connectControl("[Channel2]", "playposition", TraktorS3.spinnyAngleChanged);
    engine.connectControl("[Channel3]", "playposition", TraktorS3.spinnyAngleChanged);
    engine.connectControl("[Channel4]", "playposition", TraktorS3.spinnyAngleChanged);
};

TraktorS3.registerInputJog = function(message, group, name, offset, bitmask, callback) {
    // Jog wheels have 4 byte input
    message.addControl(group, name, offset, "I", bitmask);
    message.setCallback(group, name, callback);
};

TraktorS3.registerInputScaler = function(message, group, name, offset, bitmask, callback) {
    message.addControl(group, name, offset, "H", bitmask);
    message.setCallback(group, name, callback);
};

TraktorS3.registerInputButton = function(message, group, name, offset, bitmask, callback) {
    message.addControl(group, name, offset, "B", bitmask);
    message.setCallback(group, name, callback);
};

TraktorS3.deckSwitchHandler = function(field) {
    if (field.value === 0) {
        return;
    }

    if (field.group === "[Channel1]") {
        TraktorS3.activeDecks[1] = true;
        TraktorS3.activeDecks[3] = false;
    } else if (field.group === "[Channel3]") {
        TraktorS3.activeDecks[3] = true;
        TraktorS3.activeDecks[1] = false;
    } else if (field.group === "[Channel2]") {
        TraktorS3.activeDecks[2] = true;
        TraktorS3.activeDecks[4] = false;
    } else if (field.group === "[Channel4]") {
        TraktorS3.activeDecks[4] = true;
        TraktorS3.activeDecks[2] = false;
    } else {
        HIDDebug("Traktor S4MK2: Unrecognized packet group: " + field.group);
    }
    engine.softTakeoverIgnoreNextValue(field.group, "rate");
    TraktorS3.lightDeck(field.group);
};

TraktorS3.playHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "start_stop", field.value);
    } else if (field.value === 1) {
        script.toggleControl(activeGroup, "play");
    }
};

TraktorS3.cueHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "cue_gotoandstop", field.value);
    } else {
        engine.setValue(activeGroup, "cue_default", field.value);
    }
};


TraktorS3.shiftHandler = function(field) {
    engine.setValue("[Controls]", "touch_shift", field.value);
    TraktorS3.shiftPressed[field.group] = field.value;
    TraktorS3.outputHandler(field.value, field.group, "!shift");
};

TraktorS3.keylockHandler = function(field) {
    var activeGroup;
    if (TraktorS3.pitchSliderRelativeMode) {
        if (field.value) {
            TraktorS3.keylockPressed[field.group] = true;
            TraktorS3.keyAdjusted[field.group] = false;
            return;
        }
        TraktorS3.keylockPressed[field.group] = false;
        activeGroup = TraktorS3.deckToGroup(field.group);
        if (!activeGroup) {
            return;
        }
        if (!TraktorS3.keyAdjusted[field.group]) {
            script.toggleControl(activeGroup, "keylock");
        }
        return;
    }
    activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }

    if (field.value === 0) {
        return;
    }
    script.toggleControl(activeGroup, "keylock");
};

TraktorS3.syncHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }

    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "beatsync_phase", field.value);
        // Light LED while pressed
        TraktorS3.colorDeckOutputHandler(field.value, field.group, "sync_enabled");
    } else {
        if (field.value) {
            if (engine.getValue(activeGroup, "sync_enabled") === 0) {
                script.triggerControl(activeGroup, "beatsync");
                // Start timer to measure how long button is pressed
                TraktorS3.syncPressedTimer[field.group] = engine.beginTimer(300, function() {
                    engine.setValue(activeGroup, "sync_enabled", 1);
                    // Reset sync button timer state if active
                    if (TraktorS3.syncPressedTimer[field.group] !== 0) {
                        TraktorS3.syncPressedTimer[field.group] = 0;
                    }
                }, true);

                // Light corresponding LED when button is pressed
                TraktorS3.colorDeckOutputHandler(1, field.group, "sync_enabled");
            } else {
                // Deactivate sync lock
                // LED is turned off by the callback handler for sync_enabled
                engine.setValue(activeGroup, "sync_enabled", 0);
            }
        } else {
            if (TraktorS3.syncPressedTimer[field.group] !== 0) {
                // Timer still running -> stop it and unlight LED
                engine.stopTimer(TraktorS3.syncPressedTimer[field.group]);
                TraktorS3.colorDeckOutputHandler(0, field.group, "sync_enabled");
            }
        }
    }
};

// This handles when the mode buttons for the pads is pressed.
TraktorS3.padModeHandler = function(field) {
    if (field.value === 0) {
        return;
    }

    if (TraktorS3.padModeState[field.group] === 0 && field.name === "!samples") {
        // If we are in hotcues mode and samples mode is activated
        engine.setValue("[Samplers]", "show_samplers", 1);
        TraktorS3.padModeState[field.group] = 1;
    } else if (field.name === "!hotcues") {
        // If we are in samples mode and hotcues mode is activated
        TraktorS3.padModeState[field.group] = 0;
    }
    TraktorS3.lightPads(field.group);
};

TraktorS3.numberButtonHandler = function(field) {
    var padNumber = parseInt(field.id[field.id.length - 1]);

    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    if (TraktorS3.padModeState[field.group] === 0) {
        TraktorS3.lightHotcue(activeGroup, padNumber);

        // Hotcues mode
        if (TraktorS3.shiftPressed[field.group]) {
            engine.setValue(activeGroup, "hotcue_" + padNumber + "_clear", field.value);
        } else {
            engine.setValue(activeGroup, "hotcue_" + padNumber + "_activate", field.value);
        }
    } else {
        // Samples mode
        var sampler = padNumber;
        if (field.group === "deck2") {
            sampler += 8;
        }

        var ledValue = field.value;
        if (!field.value) {
            ledValue = engine.getValue("[Sampler" + sampler + "]", "track_loaded");
        }
        TraktorS3.colorDeckOutputHandler(ledValue, field.group, "!pad_" + padNumber);

        if (TraktorS3.shiftPressed[field.group]) {
            var playing = engine.getValue("[Sampler" + sampler + "]", "play");
            if (playing) {
                engine.setValue("[Sampler" + sampler + "]", "cue_default", field.value);
            } else {
                engine.setValue("[Sampler" + sampler + "]", "eject", field.value);
            }
        } else {
            var loaded = engine.getValue("[Sampler" + sampler + "]", "track_loaded");
            if (loaded) {
                if (field.value) {
                    engine.setValue("[Sampler" + sampler + "]", "cue_gotoandplay", field.value);
                } else {
                    engine.setValue("[Sampler" + sampler + "]", "stop", 1);
                }
            } else {
                engine.setValue("[Sampler" + sampler + "]", "LoadSelectedTrack", field.value);
            }
        }
    }
};

TraktorS3.headphoneHandler = function(field) {
    if (field.value === 0) {
        return;
    }
    script.toggleControl(field.group, "pfl");
};

TraktorS3.selectTrackHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    var delta = 1;
    if ((field.value + 1) % 16 === TraktorS3.browseKnobEncoderState[activeGroup]) {
        delta = -1;
    }
    TraktorS3.browseKnobEncoderState[activeGroup] = field.value;

    // When preview is held, rotating the library encoder scrolls through the previewing track.
    if (TraktorS3.previewPressed[field.group]) {
        var playPosition = engine.getValue("[PreviewDeck1]", "playposition");
        if (delta > 0) {
            playPosition += 0.0125;
        } else {
            playPosition -= 0.0125;
        }
        engine.setValue("[PreviewDeck1]", "playposition", playPosition);
        return;
    }

    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue("[Library]", "MoveHorizontal", delta);
    } else {
        engine.setValue("[Library]", "MoveVertical", delta);
    }
};

TraktorS3.loadTrackHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "eject", field.value);
    } else {
        engine.setValue(activeGroup, "LoadSelectedTrack", field.value);
    }
};

TraktorS3.previewTrackHandler = function(field) {
    if (field.value === 1) {
        TraktorS3.previewPressed[field.group] = true;
        engine.setValue("[PreviewDeck1]", "LoadSelectedTrackAndPlay", 1);
    } else {
        TraktorS3.previewPressed[field.group] = false;
        engine.setValue("[PreviewDeck1]", "play", 0);
    }
    TraktorS3.colorDeckOutputHandler(field.value, field.group, "!PreviewTrack");
};

TraktorS3.cueAutoDJHandler = function(field) {
    TraktorS3.colorDeckOutputHandler(field.value, field.group, "!AddTrack");

    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }

    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue("[Library]", "AutoDjAddTop", field.value);
    } else {
        engine.setValue("[Library]", "AutoDjAddBottom", field.value);
    }
};

TraktorS3.LibraryFocusHandler = function(field) {
    TraktorS3.colorDeckOutputHandler(field.value, field.group, "!LibraryFocus");
    if (field.value === 0) {
        return;
    }

    script.toggleControl("[Library]", "MoveFocus");
};

TraktorS3.selectLoopHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    if ((field.value + 1) % 16 === TraktorS3.loopKnobEncoderState[activeGroup]) {
        script.triggerControl(activeGroup, "loop_halve");
    } else {
        script.triggerControl(activeGroup, "loop_double");
    }

    TraktorS3.loopKnobEncoderState[activeGroup] = field.value;
};

TraktorS3.activateLoopHandler = function(field) {
    if (field.value === 0) {
        return;
    }
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    var isLoopActive = engine.getValue(activeGroup, "loop_enabled");

    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "reloop_toggle", field.value);
    } else {
        if (isLoopActive) {
            engine.setValue(activeGroup, "reloop_toggle", field.value);
        } else {
            engine.setValue(activeGroup, "beatloop_activate", field.value);
        }
    }
};

TraktorS3.selectBeatjumpHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    var delta = 1;
    if ((field.value + 1) % 16 === TraktorS3.moveKnobEncoderState[activeGroup]) {
        delta = -1;
    }

    if (TraktorS3.shiftPressed[field.group]) {
        var beatjumpSize = engine.getValue(activeGroup, "beatjump_size");
        if (delta > 0) {
            engine.setValue(activeGroup, "beatjump_size", beatjumpSize * 2);
        } else {
            engine.setValue(activeGroup, "beatjump_size", beatjumpSize / 2);
        }
    } else {
        if (delta < 0) {
            script.triggerControl(activeGroup, "beatjump_backward");
        } else {
            script.triggerControl(activeGroup, "beatjump_forward");
        }
    }

    TraktorS3.moveKnobEncoderState[activeGroup] = field.value;
};

TraktorS3.activateBeatjumpHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "reloop_andstop", field.value);
    } else {
        engine.setValue(activeGroup, "beatlooproll_activate", field.value);
    }
};

TraktorS3.microphoneHandler = function(field) {
    if (field.value) {
        if (TraktorS3.microphonePressedTimer === 0) {
            // Start timer to measure how long button is pressed
            TraktorS3.microphonePressedTimer = engine.beginTimer(300, function() {
                // Reset microphone button timer status if active
                if (TraktorS3.microphonePressedTimer !== 0) {
                    TraktorS3.microphonePressedTimer = 0;
                }
            }, true);
        }

        script.toggleControl("[Microphone]", "talkover");
    } else {
        // Button is released, check if timer is still running
        if (TraktorS3.microphonePressedTimer !== 0) {
            // short klick -> permanent activation
            TraktorS3.microphonePressedTimer = 0;
        } else {
            engine.setValue("[Microphone]", "talkover", 0);
        }
    }
};

TraktorS3.pitchSliderHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    var value = field.value / 4095;
    if (TraktorS3.pitchSliderRelativeMode) {
        if (TraktorS3.pitchSliderLastValue[field.group] === -1) {
            TraktorS3.pitchSliderLastValue[field.group] = value;
        } else {
            // If shift is pressed, don't update any values.
            if (TraktorS3.shiftPressed[field.group]) {
                TraktorS3.pitchSliderLastValue[field.group] = value;
                return;
            }

            var relVal;
            if (TraktorS3.keylockPressed[field.group]) {
                relVal = 1.0 - engine.getParameter(activeGroup, "pitch_adjust");
            } else {
                relVal = engine.getParameter(activeGroup, "rate");
            }
            relVal += value - TraktorS3.pitchSliderLastValue[field.group];
            TraktorS3.pitchSliderLastValue[field.group] = value;
            value = Math.max(0.0, Math.min(1.0, relVal));

            if (TraktorS3.keylockPressed[field.group]) {
                // To match the pitch change from adjusting the rate, flip the pitch
                // adjustment.
                engine.setParameter(activeGroup, "pitch_adjust", 1.0 - value);
                TraktorS3.keyAdjusted[field.group] = true;
            } else {
                engine.setParameter(activeGroup, "rate", value);
            }
        }
        return;
    }

    if (TraktorS3.shiftPressed[field.group]) {
        // To match the pitch change from adjusting the rate, flip the pitch
        // adjustment.
        engine.setParameter(activeGroup, "pitch_adjust", 1.0 - value);
    } else {
        engine.setParameter(activeGroup, "rate", value);
    }
};

TraktorS3.parameterHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    engine.setParameter(activeGroup, field.name, field.value / 4095);
};

TraktorS3.jogTouchHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    if (TraktorS3.wheelTouchInertiaTimer[activeGroup] !== 0) {
        // The wheel was touched again, reset the timer.
        engine.stopTimer(TraktorS3.wheelTouchInertiaTimer[activeGroup]);
        TraktorS3.wheelTouchInertiaTimer[activeGroup] = 0;
    }
    if (field.value !== 0) {
        var deckNumber = TraktorS3.controller.resolveDeck(activeGroup);
        if (deckNumber === undefined) {
            return;
        }
        engine.setValue(activeGroup, "scratch2_enable", true);
    } else {
        // The wheel touch sensor can be overly sensitive, so don't release scratch mode right away.
        // Depending on how fast the platter was moving, lengthen the time we'll wait.
        var scratchRate = Math.abs(engine.getValue(activeGroup, "scratch2"));
        // Note: inertiaTime multiplier is controller-specific and should be factored out.
        var inertiaTime = Math.pow(1.8, scratchRate) * 2;
        if (inertiaTime < 100) {
            // Just do it now.
            TraktorS3.finishJogTouch(activeGroup);
        } else {
            TraktorS3.wheelTouchInertiaTimer[activeGroup] = engine.beginTimer(
                inertiaTime, "TraktorS3.finishJogTouch(\"" + activeGroup + "\")", true);
        }
    }
};

TraktorS3.jogHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (!activeGroup) {
        return;
    }
    TraktorS3.tickReceived[activeGroup] = true;
    var deltas = TraktorS3.wheelDeltas(activeGroup, field.value);
    var tickDelta = deltas[0];
    var timeDelta = deltas[1];

    // The scratch rate is the ratio of the wheel's speed to "regular" speed,
    // which we're going to call 33.33 RPM.  It's 768 ticks for a circle, and
    // 400000 ticks per second, and 33.33 RPM is 1.8 seconds per rotation, so
    // the standard speend is 768 / (400000 * 1.8)
    var thirtyThree = 768 / 720000;

    // Our actual speed is tickDelta / timeDelta.  Take the ratio of those to get the
    // rate ratio.
    var velocity = (tickDelta / timeDelta) / thirtyThree;

    // The Mixxx scratch code tries to do accumulation and time calculation itself.
    // This controller is better, so just use its values.
    if (engine.getValue(activeGroup, "scratch2_enable")) {
        engine.setValue(activeGroup, "scratch2", velocity);
    } else {
        // If we're playing, just nudge.
        if (engine.getValue(activeGroup, "play")) {
            velocity /= 4;
        } else {
            velocity *= 2;
        }
        engine.setValue(activeGroup, "jog", velocity);
    }
};

TraktorS3.wheelDeltas = function(deckNumber, value) {
    // When the wheel is touched, four bytes change, but only the first behaves predictably.
    // It looks like the wheel is 1024 ticks per revolution.
    var tickval = value & 0xFF;
    var timeval = value >>> 8;
    var prevTick = 0;
    var prevTime = 0;

    // Group 1 and 2 -> Array index 0 and 1
    prevTick = this.lastTickVal[deckNumber - 1];
    prevTime = this.lastTickTime[deckNumber - 1];
    this.lastTickVal[deckNumber - 1] = tickval;
    this.lastTickTime[deckNumber - 1] = timeval;

    if (prevTime > timeval) {
        // We looped around.  Adjust current time so that subtraction works.
        timeval += 0x100000;
    }
    var timeDelta = timeval - prevTime;
    if (timeDelta === 0) {
        // Spinning too fast to detect speed!  By not dividing we are guessing it took 1ms.
        // This is almost certainly not going to happen on this controller.
        timeDelta = 1;
    }

    var tickDelta = 0;

    // Very generous 8bit loop-around detection.
    if (prevTick >= 200 && tickval <= 100) {
        tickDelta = tickval + 256 - prevTick;
    } else if (prevTick <= 100 && tickval >= 200) {
        tickDelta = tickval - prevTick - 256;
    } else {
        tickDelta = tickval - prevTick;
    }

    return [tickDelta, timeDelta];
};

TraktorS3.finishJogTouch = function(group) {
    TraktorS3.wheelTouchInertiaTimer[group] = 0;

    // If we've received no ticks since the last call, we are stopped.
    if (!TraktorS3.tickReceived[group]) {
        engine.setValue(group, "scratch2", 0.0);
        engine.setValue(group, "scratch2_enable", false);
    } else {
        // Check again soon.
        TraktorS3.wheelTouchInertiaTimer[group] = engine.beginTimer(
            100, "TraktorS3.finishJogTouch(\"" + group + "\")", true);
    }
    TraktorS3.tickReceived[group] = false;
};

TraktorS3.superHandler = function(field) {
    // The super knob drives all the supers!
    // engine.setParameter(activeGroup, field.name, field.value / 4095);
    var group = field.group;
    var value = field.value / 4095.;
    engine.setParameter("[QuickEffectRack1_" + group + "]", "super1", value);
    for (var fxNumber = 1; fxNumber <= 4; fxNumber++) {
        if (TraktorS3.fxButtonState[fxNumber]) {
            engine.setParameter("[EffectRack1_EffectUnit" + fxNumber +"]", "super1", value);
        }
    }
};

TraktorS3.fxHandler = function(field) {
    if (field.value === 0) {
        return;
    }
    var fxNumber = parseInt(field.id[field.id.length - 1]);

    // Toggle effect unit
    TraktorS3.fxButtonState[fxNumber] = !TraktorS3.fxButtonState[fxNumber];
    var ledValue = TraktorS3.fxLEDValue[fxNumber];
    if (TraktorS3.fxButtonState[fxNumber]) {
        ledValue += TraktorS3.LEDBrightValue;
    } else {
        ledValue += TraktorS3.LEDDimValue;
    }
    TraktorS3.controller.setOutput("[ChannelX]", "!fxButton" + fxNumber, ledValue, !TraktorS3.batchingOutputs);
    // TraktorS3.colorOutputHandler(TraktorS3.fxButtonState[fxNumber], field.group, "!fxButton" + fxNumber);
    TraktorS3.toggleFX();
};

TraktorS3.fxEnableHandler = function(field) {
    if (field.value === 0) {
        return;
    }
    TraktorS3.fxEnabledState[field.group] = !TraktorS3.fxEnabledState[field.group];
    TraktorS3.colorOutputHandler(TraktorS3.fxEnabledState[field.group], field.group, "!fxEnabled");
    TraktorS3.toggleFX();
};

TraktorS3.toggleFX = function() {
    // This is an AND operation.  We go through each channel, and if
    // the fx is ON, we turn the effect ON. We turn OFF no matter what.
    for (var fxNumber = 1; fxNumber <= 5; fxNumber++) {
        for (var ch = 1; ch <= 4; ch++) {
            var group = "[Channel" + ch + "]";
            var fxGroup = "[EffectRack1_EffectUnit" + fxNumber + "]";
            var fxKey = "group_[Channel1]_enable";
            if (fxNumber === 5) {
                fxGroup = "[QuickEffectRack1_[Channel" + ch + "]_Effect1]";
                fxKey = "enabled";
            }

            var newState = TraktorS3.fxEnabledState[group] && TraktorS3.fxButtonState[fxNumber];
            engine.setValue(fxGroup, fxKey, newState);
        }
    }

};

TraktorS3.reverseHandler = function(field) {
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "reverseroll", field.value);
    } else {
        engine.setValue(activeGroup, "reverse", field.value);
    }

    TraktorS3.deckOutputHandler(field.value, field.group, "!reverse");
};

TraktorS3.fluxHandler = function(field) {
    if (field.value === 0) {
        return;
    }
    var activeGroup = TraktorS3.deckToGroup(field.group);

    script.toggleControl(activeGroup, "slip_enabled");
};

TraktorS3.quantizeHandler = function(field) {
    if (field.value === 0) {
        return;
    }
    var activeGroup = TraktorS3.deckToGroup(field.group);
    if (TraktorS3.shiftPressed[field.group]) {
        engine.setValue(activeGroup, "beats_translate_curpos", field.value);
    } else {
        script.toggleControl(activeGroup, "quantize");
        // engine.setValue(activeGroup, "quantize", newState);
        // TraktorS3.colorDeckOutputHandler(newState, field.group, "quantize");
    }
};

// function sleepFor(sleepDuration) {
//     var now = new Date().getTime();
//     while (new Date().getTime() < now + sleepDuration) { /* do nothing */ }
// }

TraktorS3.init = function(_id) {
    TraktorS3.registerInputPackets();
    TraktorS3.registerOutputPackets();
    HIDDebug("TraktorS3: Init done!");

    TraktorS3.lightDeck("[Channel3]", false);
    TraktorS3.lightDeck("[Channel4]", false);
    TraktorS3.lightDeck("[Channel1]", false);
    TraktorS3.lightDeck("[Channel2]", true);

    // TraktorS3.debugLights();
};

TraktorS3.debugLights = function() {
    // Call this if you want to just send raw packets to the controller (good for figuring out what
    // bytes do what).
    var dataStrings = [
        "      7C 00  35 2C 2C FF  2C 39 FF 00  FF FF 00 35 " +
        "00 2C 7E 00  00 FF FF FF  2C 2C 20 7C  7C 00 FF 00 " +
        "FF 00 00 00  FF 00 FF 2C  00 FF 2C 7C  FF 00 00 00 " +
        "00 00 00 00  7E 0C 0C FF  0C FF FF FF  FF FF FF FF " +
        "FF FF 40 FF  FF FF 00 FF  FF 2E FF 00  00 FF 00 00 " +
        "00 00 FF 00 ",
        "      00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  FF FF FF 00  FF 00 00 00  FF 00 00",
    ];

    var data = [Object(), Object()];


    for (var i = 0; i < data.length; i++) {
        var ok = true;
        var splitted = dataStrings[i].split(/\s+/);
        HIDDebug("i " + i + " " + splitted);
        data[i].length = splitted.length;
        for (var j = 0; j < splitted.length; j++) {
            var byteStr = splitted[j];
            if (byteStr.length === 0) {
                continue;
            }
            if (byteStr.length !== 2) {
                ok = false;
                HIDDebug("not two characters?? " + byteStr);
            }
            var b = parseInt(byteStr, 16);
            if (b < 0 || b > 255) {
                ok = false;
                HIDDebug("number out of range: " + byteStr + " " + b);
            }
            data[i][j] = b;
        }
        // if (i === 0) {
        //     for (k = 0; k < data[0].length; k++) {
        //         data[0][k] = 0x30;
        //     }
        // }
        // for (d = 0; d < 8; d++) {
        //     data[0][0x11+d] = (d+1) * 4 + 2;
        // }
        // for (d = 0; d < 8; d++) {
        //     data[0][0x2A + d] = (d + 1) * 4 + 32 + 2;
        // }
        if (ok) {
            TraktorS3.controller.send(data[i], data[i].length, 0x80 + i);
        }
    }
};

TraktorS3.registerOutputPackets = function() {
    var outputA = new HIDPacket("outputA", 0x80);

    outputA.addOutput("deck1", "!shift", 0x01, "B");
    outputA.addOutput("deck2", "!shift", 0x1A, "B");

    outputA.addOutput("deck1", "slip_enabled", 0x02, "B");
    outputA.addOutput("deck2", "slip_enabled", 0x1B, "B");

    outputA.addOutput("deck1", "!reverse", 0x03, "B");
    outputA.addOutput("deck2", "!reverse", 0x1C, "B");

    outputA.addOutput("deck1", "!PreviewTrack", 0x04, "B");
    outputA.addOutput("deck2", "!PreviewTrack", 0x1D, "B");

    outputA.addOutput("deck1", "!PreviewTrack", 0x04, "B");
    outputA.addOutput("deck2", "!PreviewTrack", 0x1D, "B");

    outputA.addOutput("deck1", "!AddTrack", 0x06, "B");
    outputA.addOutput("deck2", "!AddTrack", 0x1F, "B");

    outputA.addOutput("deck1", "!LibraryFocus", 0x07, "B");
    outputA.addOutput("deck2", "!LibraryFocus", 0x20, "B");

    outputA.addOutput("[Channel1]", "!deck_A", 0x0A, "B");
    outputA.addOutput("[Channel2]", "!deck_B", 0x23, "B");
    outputA.addOutput("[Channel3]", "!deck_C", 0x0B, "B");
    outputA.addOutput("[Channel4]", "!deck_D", 0x24, "B");

    outputA.addOutput("deck1", "keylock", 0x0D, "B");
    outputA.addOutput("deck2", "keylock", 0x26, "B");

    outputA.addOutput("deck1", "hotcues", 0x0E, "B");
    outputA.addOutput("deck2", "hotcues", 0x27, "B");

    outputA.addOutput("deck1", "samples", 0x0F, "B");
    outputA.addOutput("deck2", "samples", 0x28, "B");

    outputA.addOutput("deck1", "cue_indicator", 0x10, "B");
    outputA.addOutput("deck2", "cue_indicator", 0x29, "B");

    outputA.addOutput("deck1", "play_indicator", 0x11, "B");
    outputA.addOutput("deck2", "play_indicator", 0x2A, "B");

    outputA.addOutput("deck1", "sync_enabled", 0x0C, "B");
    outputA.addOutput("deck2", "sync_enabled", 0x25, "B");

    outputA.addOutput("deck1", "!pad_1", 0x12, "B");
    outputA.addOutput("deck1", "!pad_2", 0x13, "B");
    outputA.addOutput("deck1", "!pad_3", 0x14, "B");
    outputA.addOutput("deck1", "!pad_4", 0x15, "B");
    outputA.addOutput("deck1", "!pad_5", 0x16, "B");
    outputA.addOutput("deck1", "!pad_6", 0x17, "B");
    outputA.addOutput("deck1", "!pad_7", 0x18, "B");
    outputA.addOutput("deck1", "!pad_8", 0x19, "B");

    outputA.addOutput("deck2", "!pad_1", 0x2B, "B");
    outputA.addOutput("deck2", "!pad_2", 0x2C, "B");
    outputA.addOutput("deck2", "!pad_3", 0x2D, "B");
    outputA.addOutput("deck2", "!pad_4", 0x2E, "B");
    outputA.addOutput("deck2", "!pad_5", 0x2F, "B");
    outputA.addOutput("deck2", "!pad_6", 0x30, "B");
    outputA.addOutput("deck2", "!pad_7", 0x31, "B");
    outputA.addOutput("deck2", "!pad_8", 0x32, "B");

    outputA.addOutput("[Channel1]", "pfl", 0x39, "B");
    outputA.addOutput("[Channel2]", "pfl", 0x3A, "B");
    outputA.addOutput("[Channel3]", "pfl", 0x38, "B");
    outputA.addOutput("[Channel4]", "pfl", 0x3B, "B");

    outputA.addOutput("deck1", "addTrack", 0x03, "B");
    outputA.addOutput("deck2", "addTrack", 0x2A, "B");

    outputA.addOutput("deck1", "quantize", 0x08, "B");
    outputA.addOutput("deck2", "quantize", 0x21, "B");

    // outputA.addOutput("[Microphone]", "talkover", 0x3D, "B");

    outputA.addOutput("[ChannelX]", "!fxButton1", 0x3C, "B");
    outputA.addOutput("[ChannelX]", "!fxButton2", 0x3D, "B");
    outputA.addOutput("[ChannelX]", "!fxButton3", 0x3E, "B");
    outputA.addOutput("[ChannelX]", "!fxButton4", 0x3F, "B");
    outputA.addOutput("[ChannelX]", "!fxButton5", 0x40, "B");

    outputA.addOutput("[Channel3]", "!fxEnabled", 0x34, "B");
    outputA.addOutput("[Channel1]", "!fxEnabled", 0x35, "B");
    outputA.addOutput("[Channel2]", "!fxEnabled", 0x36, "B");
    outputA.addOutput("[Channel4]", "!fxEnabled", 0x37, "B");

    var wheelOffsets = {
        "deck1": 0x43,
        "deck2": 0x4A
    };
    for (var ch in wheelOffsets) {
        for (var i = 0; i < 8; i++) {
            outputA.addOutput(ch, "!" + "wheel" + i, wheelOffsets[ch] + i, "B");
        }
    }

    this.controller.registerOutputPacket(outputA);

    var outputB = new HIDPacket("outputB", 0x81);

    var VuOffsets = {
        "[Channel3]": 0x01,
        "[Channel1]": 0x10,
        "[Channel2]": 0x1F,
        "[Channel4]": 0x2E
    };
    for (ch in VuOffsets) {
        for (i = 0; i < 14; i++) {
            outputB.addOutput(ch, "!" + "VuMeter" + i, VuOffsets[ch] + i, "B");
        }
    }

    var MasterVuOffsets = {
        "VuMeterL": 0x3D,
        "VuMeterR": 0x46
    };
    for (i = 0; i < 8; i++) {
        outputB.addOutput("[Master]", "!" + "VuMeterL" + i, MasterVuOffsets["VuMeterL"] + i, "B");
        outputB.addOutput("[Master]", "!" + "VuMeterR" + i, MasterVuOffsets["VuMeterR"] + i, "B");
    }

    outputB.addOutput("[Master]", "PeakIndicatorL", 0x45, "B");
    outputB.addOutput("[Master]", "PeakIndicatorR", 0x4E, "B");

    outputB.addOutput("[Channel3]", "PeakIndicator", 0x0F, "B");
    outputB.addOutput("[Channel1]", "PeakIndicator", 0x1E, "B");
    outputB.addOutput("[Channel2]", "PeakIndicator", 0x2D, "B");
    outputB.addOutput("[Channel4]", "PeakIndicator", 0x3C, "B");

    this.controller.registerOutputPacket(outputB);

    // Play is always green
    TraktorS3.linkDeckOutputs("play_indicator", this.wheelOutputHandler);
    TraktorS3.linkDeckOutputs("cue_indicator", this.colorDeckOutputHandler);
    TraktorS3.linkDeckOutputs("sync_enabled", this.colorDeckOutputHandler);
    TraktorS3.linkDeckOutputs("keylock", this.colorDeckOutputHandler);
    TraktorS3.linkDeckOutputs("slip_enabled", this.deckOutputHandler);
    TraktorS3.linkDeckOutputs("quantize", this.colorDeckOutputHandler);

    TraktorS3.linkChannelOutput("[Channel1]", "pfl", this.outputHandler);
    TraktorS3.linkChannelOutput("[Channel2]", "pfl", this.outputHandler);
    TraktorS3.linkChannelOutput("[Channel3]", "pfl", this.outputHandler);
    TraktorS3.linkChannelOutput("[Channel4]", "pfl", this.outputHandler);

    // this.linkOutput("[Microphone]", "talkover", this.outputHandler);

    // Channel VuMeters
    for (i = 1; i <= 4; i++) {
        this.vuConnections[i] = engine.makeConnection("[Channel" + i + "]", "VuMeter", this.channelVuMeterHandler);
        this.clipConnections[i] = engine.makeConnection("[Channel" + i + "]", "PeakIndicator", this.peakOutputHandler);
    }

    // Master VuMeters
    this.masterVuConnections["VuMeterL"] = engine.makeConnection("[Master]", "VuMeterL", this.masterVuMeterHandler);
    this.masterVuConnections["VuMeterR"] = engine.makeConnection("[Master]", "VuMeterR", this.masterVuMeterHandler);
    this.linkChannelOutput("[Master]", "PeakIndicatorL", this.peakOutputHandler);
    this.linkChannelOutput("[Master]", "PeakIndicatorR", this.peakOutputHandler);

    // Sampler callbacks
    for (i = 1; i <= 16; ++i) {
        this.samplerCallbacks.push(engine.makeConnection("[Sampler" + i + "]", "track_loaded", this.samplesOutputHandler));
        this.samplerCallbacks.push(engine.makeConnection("[Sampler" + i + "]", "play", this.samplesOutputHandler));
    }
};

/* Helper function to link output in a short form */
TraktorS3.linkChannelOutput = function(group, name, callback) {
    TraktorS3.controller.linkOutput(group, name, group, name, callback);
};

TraktorS3.linkDeckOutputs = function(key, callback) {
    // Linking outputs is a little tricky because the library doesn't quite do what I want.  But this
    // method works.
    TraktorS3.controller.linkOutput("deck1", key, "[Channel1]", key, callback);
    engine.connectControl("[Channel3]", key, callback);
    TraktorS3.controller.linkOutput("deck2", key, "[Channel2]", key, callback);
    engine.connectControl("[Channel4]", key, callback);

    // TraktorS3.controller.linkOutput("[Channel1]", key, "deck1", key, callback);
    // TraktorS3.controller.linkOutput("[Channel2]", key, "deck2", key, callback);
    // TraktorS3.controller.linkOutput("[Channel3]", key, "deck1", key, callback);
    // TraktorS3.controller.linkOutput("[Channel4]", key, "deck2", key, callback);
};

TraktorS3.deckToGroup = function(deck) {
    if (deck === "deck1") {
        if (this.activeDecks[1]) {
            return "[Channel1]";
        } else if (this.activeDecks[3]) {
            return "[Channel3]";
        }
    } else if (deck === "deck2") {
        if (this.activeDecks[2]) {
            return "[Channel2]";
        } else if (this.activeDecks[4]) {
            return "[Channel4]";
        }
    }
    // Return original value, it's already a group
    return deck;
};

TraktorS3.resolveDeckIfActive = function(group) {
    var controller = TraktorS3.controller;
    if (group === "[Channel1]") {
        if (controller.left_deck_C) {
            return undefined;
        }
        return "deck1";
    } else if (group === "[Channel3]") {
        if (!controller.left_deck_C) {
            return undefined;
        }
        return "deck1";
    } else if (group === "[Channel2]") {
        if (controller.right_deck_D) {
            return undefined;
        }
        return "deck2";
    } else if (group === "[Channel4]") {
        if (!controller.right_deck_D) {
            return undefined;
        }
        return "deck2";
    }
    return undefined;
};

TraktorS3.lightGroup = function(packet, outputGroupName, coGroupName) {
    var groupOb = packet.groups[outputGroupName];
    for (var fieldName in groupOb) {
        var field = groupOb[fieldName];
        if (field.name[0] === "!") {
            continue;
        }
        if (field.mapped_callback !== undefined) {
            var value = engine.getValue(coGroupName, field.name);
            field.mapped_callback(value, coGroupName, field.name);
        }
    // No callback, no light!
    }
};

TraktorS3.colorForHotcue = function(group, num) {
    var colorCode = engine.getValue(group, "hotcue_" + num + "_color");
    return TraktorS3.colorMap.getValueForNearestColor(colorCode);
};

TraktorS3.lightHotcue = function(group, number) {
    var deck = TraktorS3.resolveDeckIfActive(group);
    var active = engine.getValue(group, "hotcue_" + number + "_enabled");
    var ledValue = TraktorS3.controller.LEDColors.WHITE;
    if (active) {
        ledValue = TraktorS3.colorForHotcue(group, number);
        ledValue += TraktorS3.LEDDimValue;
    } else {
        ledValue += TraktorS3.LEDDimValue;
    }
    TraktorS3.controller.setOutput(deck, "!pad_" + number, ledValue, !TraktorS3.batchingOutputs);
};

TraktorS3.lightPads = function(group) {
    var activeGroup = TraktorS3.deckToGroup(group);
    // Samplers
    if (TraktorS3.padModeState[group] === 1) {
        TraktorS3.colorDeckOutputHandler(0, activeGroup, "hotcues");
        TraktorS3.colorDeckOutputHandler(1, activeGroup, "samples");
        for (var i = 1; i <= 8; i++) {
            var idx = i;
            if (group === "deck2") {
                idx += 8;
            }
            var loaded = engine.getValue("[Sampler" + idx + "]", "track_loaded");
            TraktorS3.colorDeckOutputHandler(loaded, group, "!pad_" + idx);
        }
    } else {
        TraktorS3.colorDeckOutputHandler(1, activeGroup, "hotcues");
        TraktorS3.colorDeckOutputHandler(0, activeGroup, "samples");
        for (i = 1; i <= 8; ++i) {
            TraktorS3.lightHotcue(activeGroup, i);
        }
    }
};

TraktorS3.lightFX = function() {
    for (var ch = 1; ch <= 4; ch++) {
        var group = "[Channel" + ch + "]";
        TraktorS3.colorOutputHandler(TraktorS3.fxEnabledState[group], group, "!fxEnabled");
    }
    for (var fxNumber = 1; fxNumber <= 5; fxNumber++) {
        var ledValue = TraktorS3.fxLEDValue[fxNumber];
        if (TraktorS3.fxButtonState[fxNumber]) {
            ledValue += TraktorS3.LEDBrightValue;
        } else {
            ledValue += TraktorS3.LEDDimValue;
        }
        TraktorS3.controller.setOutput("[ChannelX]", "!fxButton" + fxNumber, ledValue, !TraktorS3.batchingOutputs);
    }
};

TraktorS3.lightDeck = function(group, sendPackets) {
    if (sendPackets === undefined) {
        sendPackets = true;
    }
    // Freeze the lights while we do this update so we don't spam HID.
    TraktorS3.batchingOutputs = true;
    for (var packetName in this.controller.OutputPackets) {
        var packet = this.controller.OutputPackets[packetName];
        var deckGroupName = "deck1";
        if (group === "[Channel2]" || group === "[Channel4]") {
            deckGroupName = "deck2";
        }

        TraktorS3.lightGroup(packet, deckGroupName, group);
        TraktorS3.lightGroup(packet, group, group);

        TraktorS3.lightPads(deckGroupName);

        // These lights are different because either they aren't associated with a CO, or
        // there are two buttons that point to the same CO.
        TraktorS3.deckOutputHandler(0, deckGroupName, "!shift");
        TraktorS3.colorDeckOutputHandler(0, deckGroupName, "!PreviewTrack");
        TraktorS3.colorDeckOutputHandler(0, deckGroupName, "!AddTrack");
        TraktorS3.colorDeckOutputHandler(0, deckGroupName, "!LibraryFocus");
        TraktorS3.deckOutputHandler(0, deckGroupName, "!reverse");
    }
    TraktorS3.lightFX();

    // Selected deck lights
    var ctrlr = TraktorS3.controller;
    if (group === "[Channel1]") {
        ctrlr.setOutput("[Channel1]", "!deck_A", ctrlr.LEDColors[ctrlr.deckOutputColors[1]] + TraktorS3.LEDBrightValue, false);
        ctrlr.setOutput("[Channel3]", "!deck_C", ctrlr.LEDColors[ctrlr.deckOutputColors[3]] + TraktorS3.LEDDimValue, false);
    } else if (group === "[Channel2]") {
        ctrlr.setOutput("[Channel2]", "!deck_B", ctrlr.LEDColors[ctrlr.deckOutputColors[2]] + TraktorS3.LEDBrightValue, false);
        ctrlr.setOutput("[Channel4]", "!deck_D", ctrlr.LEDColors[ctrlr.deckOutputColors[4]] + TraktorS3.LEDDimValue, false);
    } else if (group === "[Channel3]") {
        ctrlr.setOutput("[Channel3]", "!deck_C", ctrlr.LEDColors[ctrlr.deckOutputColors[3]] + TraktorS3.LEDBrightValue, false);
        ctrlr.setOutput("[Channel1]", "!deck_A", ctrlr.LEDColors[ctrlr.deckOutputColors[1]] + TraktorS3.LEDDimValue, false);
    } else if (group === "[Channel4]") {
        ctrlr.setOutput("[Channel4]", "!deck_D", ctrlr.LEDColors[ctrlr.deckOutputColors[4]] + TraktorS3.LEDBrightValue, false);
        ctrlr.setOutput("[Channel2]", "!deck_B", ctrlr.LEDColors[ctrlr.deckOutputColors[2]] + TraktorS3.LEDDimValue, false);
    }

    TraktorS3.batchingOutputs = false;
    // And now send them all.
    if (sendPackets) {
        for (packetName in this.controller.OutputPackets) {
            this.controller.OutputPackets[packetName].send();
        }
    }
};

TraktorS3.channelVuMeterHandler = function(value, group, key) {
    TraktorS3.vuMeterHandler(value, group, key, 14);
};

TraktorS3.masterVuMeterHandler = function(value, group, key) {
    TraktorS3.vuMeterHandler(value, group, key, 8);
};

TraktorS3.vuMeterHandler = function(value, group, key, segments) {
    // return;
    // This handler is called a lot so it should be as fast as possible.
    var scaledValue = value * segments;
    var fullIllumCount = Math.floor(scaledValue);

    // Figure out how much the partially-illuminated segment is illuminated.
    var partialIllum = (scaledValue - fullIllumCount) * 0x7F;

    for (var i = 0; i < segments; i++) {
        var segmentKey = "!" + key + i;
        if (i < fullIllumCount) {
            // Don't update lights until they're all done, so the last term is false.
            TraktorS3.controller.setOutput(group, segmentKey, 0x7F, false);
        } else if (i === fullIllumCount) {
            TraktorS3.controller.setOutput(group, segmentKey, partialIllum, false);
        } else {
            TraktorS3.controller.setOutput(group, segmentKey, 0x00, false);
        }
    }
    TraktorS3.controller.OutputPackets["outputB"].send();
};

TraktorS3.peakOutputHandler = function(value, group, key) {
    var ledValue = 0x00;
    if (value) {
        ledValue = 0x7E;
    }

    TraktorS3.controller.setOutput(group, key, ledValue, !TraktorS3.batchingOutputs);
};

// outputHandler drives lights that only have one color.
TraktorS3.outputHandler = function(value, group, key) {
    var ledValue = value;
    if (value === 0 || value === false) {
        // Off value
        ledValue = 0x04;
    } else if (value === 1 || value === true) {
        // On value
        ledValue = 0xFF;
    }

    TraktorS3.controller.setOutput(group, key, ledValue, !TraktorS3.batchingOutputs);
};

// deckOutputHandler drives lights that only have one color.
TraktorS3.deckOutputHandler = function(value, group, key) {
    // incoming value will be a channel, we have to resolve back to
    // deck.
    var ledValue = 0x20;
    if (value === 1 || value === true) {
        // On value
        ledValue = 0x77;
    }
    TraktorS3.controller.setOutput(group, key, ledValue, !TraktorS3.batchingOutputs);
};

TraktorS3.spinnyAngleChanged = function(value, group) {
    var deck = TraktorS3.resolveDeckIfActive(group);
    if (deck === undefined) {
        return;
    }

    var deckNum = TraktorS3.controller.resolveDeck(group);

    // How many segments away from the actual angle should we light?
    // (in both directions, so "2" will light up to four segments)
    var dimDistance = 2.5;
    // ugly hack just for testing -- assume 5 minute track for now
    var elapsed = value * 6 * 60;

    var rotations = elapsed * (1 / 1.8);  // 1/1.8 is rotations per second
    // Calculate angle from 0-1.0
    var angle = rotations - Math.floor(rotations);
    // The wheel has 8 segments
    var wheelAngle = 8.0 * angle;
    for (var seg = 0; seg < 8; seg++) {
        var distance = TraktorS3.wheelSegmentDistance(seg, wheelAngle);
        var ledValue = TraktorS3.controller.LEDColors[TraktorS3.controller.deckOutputColors[deckNum]];
        // We have 5 levels of brightness to choose from, including "off".
        var brightVal = Math.round(4 * (1.0 - (distance / dimDistance)));
        if (brightVal <= 0) {
            TraktorS3.controller.setOutput(deck, "!wheel" + seg, 0x00, false);
        } else {
            brightVal -= 1;
            TraktorS3.controller.setOutput(deck, "!wheel" + seg, ledValue + brightVal, false);
        }
    }
    TraktorS3.controller.OutputPackets["outputA"].send();
};

// Finds the shortest distance between two angles on the wheel, assuming
// 0-8.0 angle value.
TraktorS3.wheelSegmentDistance = function(segNum, angle) {
    // Account for wraparound
    if (Math.abs(segNum - angle) > 4) {
        if (angle > segNum) {
            segNum += 8;
        } else {
            angle += 8;
        }
    }
    return Math.abs(angle - segNum);
};

TraktorS3.wheelOutputHandler = function(value, group, key) {
    // Also call regular handler
    TraktorS3.deckOutputHandler(value, group, key);

    // var activeGroup = TraktorS3.deckToGroup(group);
    var deck = TraktorS3.controller.resolveDeck(group);
    if (deck === undefined) {
        return;
    }

    var sendPacket = !TraktorS3.batchingOutputs;
    TraktorS3.batchingOutputs = true;
    for (var i = 0; i < 8; i++) {
        // HIDDebug("wheel! " + ledValue.toString(16));
        TraktorS3.colorDeckOutputHandler(value, group, "!wheel" + i);
    }
    if (sendPacket) {
        for (var packetName in TraktorS3.controller.OutputPackets) {
            TraktorS3.controller.OutputPackets[packetName].send();
        }
        // Only unset batchingOutputs if it wasn't already true when we
        // entered this function.
        TraktorS3.batchingOutputs = false;
    }
};

// colorOutputHandler drives lights that have the palettized multicolor lights.
TraktorS3.colorOutputHandler = function(value, group, key) {
    var deck = TraktorS3.controller.resolveDeck(group);
    var ledValue = TraktorS3.controller.LEDColors[TraktorS3.controller.deckOutputColors[deck]];
    if (value === 1 || value === true) {
        ledValue += TraktorS3.LEDBrightValue;
    } else {
        ledValue += TraktorS3.LEDDimValue;
    }
    TraktorS3.controller.setOutput(group, key, ledValue, !TraktorS3.batchingOutputs);
};

// colorDeckOutputHandler drives lights that have the palettized multicolor lights.
TraktorS3.colorDeckOutputHandler = function(value, group, key) {
    // Reject update if it's for a specific channel that's not selected.
    var updatedDeck = TraktorS3.controller.resolveDeck(group);
    if (updatedDeck !== undefined) {
        if (!TraktorS3.activeDecks[updatedDeck]) {
            return;
        }
        if (updatedDeck === "1" || updatedDeck === "3") {
            group = "deck1";
        } else if (updatedDeck === "2" || updatedDeck === "4") {
            group = "deck2";
        }
    } else {
        // update was for a deck in general. Pick the color based on the appropriate channel
        // for this deck.
        updatedDeck = TraktorS3.controller.resolveDeck(TraktorS3.deckToGroup(group));
    }
    var ledValue = TraktorS3.controller.LEDColors[TraktorS3.controller.deckOutputColors[updatedDeck]];

    if (value === 1 || value === true) {
        ledValue += TraktorS3.LEDBrightValue;
    } else {
        ledValue += TraktorS3.LEDDimValue;
    }
    TraktorS3.controller.setOutput(group, key, ledValue, !TraktorS3.batchingOutputs);
};

TraktorS3.hotcueOutputHandler = function(value, group, key) {
    // Light button LED only when we are in hotcue mode
    if (TraktorS3.padModeState[group] === 0) {
        TraktorS3.colorDeckOutputHandler(value, group, key);
    }
};

TraktorS3.samplesOutputHandler = function(value, group, key) {
    // Sampler 1-8 -> Channel1
    // Samples 9-16 -> Channel2
    var sampler = TraktorS3.resolveSampler(group);
    var deck = "deck1";
    var num = sampler;
    if (sampler === undefined) {
        return;
    } else if (sampler > 8 && sampler < 17) {
        deck = "deck2";
        num = sampler - 8;
    }

    // If we are in samples modes light corresponding LED
    if (TraktorS3.padModeState[deck] === 1) {
        if (key === "play" && engine.getValue(group, "track_loaded")) {
            if (value) {
                // Green light on play
                TraktorS3.colorDeckOutputHandler(0x9E, deck, "!pad_" + num);
            } else {
                // Reset LED to full white light
                TraktorS3.colorDeckOutputHandler(1, deck, "!pad_" + num);
            }
        } else if (key === "track_loaded") {
            TraktorS3.colorDeckOutputHandler(value, deck, "!pad_" + num);
        }
    }
};

TraktorS3.resolveSampler = function(group) {
    if (group === undefined) {
        return undefined;
    }

    var result = group.match(script.samplerRegEx);

    if (result === null) {
        return undefined;
    }

    // Return sample number
    return result[1];
};

TraktorS3.messageCallback = function(_packet, data) {
    for (var name in data) {
        if (Object.prototype.hasOwnProperty.call(data, name)) {
            TraktorS3.controller.processButton(data[name]);
        }
    }
};

TraktorS3.shutdown = function() {
    // Deactivate all LEDs
    var dataStrings = [
        "      00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00 ",
        "      00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00 " +
        "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00",
    ];

    var data = [Object(), Object()];


    for (var i = 0; i < data.length; i++) {
        var splitted = dataStrings[i].split(/\s+/);
        data[i].length = splitted.length;
        for (var j = 0; j < splitted.length; j++) {
            var byteStr = splitted[j];
            if (byteStr.length === 0) {
                continue;
            }
            data[i][j] = parseInt(byteStr, 16);
        }
        TraktorS3.controller.send(data[i], data[i].length, 0x80 + i);
    }

    HIDDebug("TraktorS3: Shutdown done!");
};

TraktorS3.incomingData = function(data, length) {
    TraktorS3.controller.parsePacket(data, length);
};
