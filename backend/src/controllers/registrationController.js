import Event from '../models/Event.js';
import Registration from '../models/Registration.js';
import { generateQRCodeDataUrl } from '../utils/qrcode.js';
import { sendEmail } from '../utils/email.js';

export const registerForEvent = async (req, res) => {
  try {

    const event = await Event.findById(req.params.id);

    if (!event || event.status !== 'approved') {
      return res.status(400).json({
        message: 'Event not available'
      });
    }

    // Check existing registration
    const existingRegistration =
      await Registration.findOne({
        user: req.user.id,
        event: event._id
      });

    // Already active
    if (
      existingRegistration &&
      ['registered', 'waitlisted', 'attended']
        .includes(existingRegistration.status)
    ) {
      return res.status(400).json({
        message: 'Already registered or waitlisted'
      });
    }

    // Count confirmed registrations only
    const registeredCount =
      await Registration.countDocuments({
        event: event._id,
        status: 'registered'
      });

    const isFull =
      registeredCount >= event.capacity;

    let qrCodeDataUrl = null;

    // QR only for confirmed users
    if (!isFull) {

      const payload = JSON.stringify({
        userId: req.user.id,
        eventId: event._id,
        at: Date.now()
      });

      qrCodeDataUrl =
        await generateQRCodeDataUrl(payload);
    }

    let registration;

    // Reuse cancelled registration
    if (
      existingRegistration &&
      existingRegistration.status === 'cancelled'
    ) {

      existingRegistration.status =
        isFull ? 'waitlisted' : 'registered';

      existingRegistration.qrCodeDataUrl =
        qrCodeDataUrl;

      registration =
        await existingRegistration.save();

    } else {

      registration =
        await Registration.create({
          user: req.user.id,
          event: event._id,
          qrCodeDataUrl,
          status:
            isFull
              ? 'waitlisted'
              : 'registered'
        });
    }

    // Send email
    try {

      await sendEmail({
        to: req.user.email,

        subject:
          isFull
            ? `Waitlisted: ${event.title}`
            : `Registered: ${event.title}`,

        html:
          isFull
            ? `
              <p>
                ${event.title} is full.
              </p>

              <p>
                You have been added to the waitlist.
              </p>
            `
            : `
              <p>
                You are registered for
                ${event.title}.
              </p>
            `
      });

    } catch (_) {}

    res.status(201).json({
      registration,
      message:
        isFull
          ? 'Added to waitlist'
          : 'Successfully registered'
    });

  } catch (err) {

    res.status(500).json({
      message: err.message
    });

  }
};

//fetching registerations with waiting position
export const myRegistrations = async (req, res) => {
  try {

    const regs = await Registration.find({
      user: req.user.id
    }).populate('event');

    const registrationsWithPosition =
      await Promise.all(

        regs.map(async (reg) => {

          let waitlistPosition = null;

          if (reg.status === 'waitlisted') {

            const peopleAhead =
              await Registration.countDocuments({
                event: reg.event._id,
                status: 'waitlisted',
                createdAt: { $lt: reg.createdAt }
              });

            waitlistPosition =
              peopleAhead + 1;
          }

          return {
            ...reg.toObject(),
            waitlistPosition
          };
        })
      );

    res.json({
      registrations:
        registrationsWithPosition
    });

  } catch (err) {

    res.status(500).json({
      message: err.message
    });

  }
};
export const checkInParticipant = async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id);

    if (!registration) {
      return res.status(404).json({
        message: 'Registration not found'
      });
    }

    registration.checkedIn = true;
    await registration.save();

    res.status(200).json({
      message: 'Participant checked in successfully',
      registration
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};
export const checkRegistrationStatus = async (req, res) => {
  try {

    const status =
      req.body.status || 'attended';

    const reg =
      await Registration.findOneAndUpdate(
        {
          user: req.body.userId,
          event: req.params.id
        },
        {
          status: status,
          checkedInAt:
            status === 'attended'
              ? new Date()
              : undefined
        },
        { new: true }
      );

    if (!reg) {
      return res.status(404).json({
        message: 'Registration not found'
      });
    }

    // Promote waitlisted user
    if (status === 'cancelled') {
      await promoteFromWaitlist(
        req.params.id
      );
    }

    res.json({
      registration: reg
    });

  } catch (err) {

    res.status(500).json({
      message: err.message
    });

  }
};
export const exportParticipantsCsv = async (req, res) => {
  try {
    const registrations = await Registration.find({
      event: req.params.id
    }).populate('user', 'name email');

    res.status(200).json({
      participants: registrations
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};
export const myRegistrations = async (req, res) => {
  try {

    const registration =
      await Registration.findOne({
        user: req.user.id,
        event: req.params.id,
        status: { $ne: 'cancelled' }
      });

    res.json({
      isRegistered:
        registration?.status === 'registered',

      isWaitlisted:
        registration?.status === 'waitlisted',

      registration
    });

  } catch (err) {

    res.status(500).json({
      message: err.message
    });

  }
};
export const participantsForEvent = async (req, res) => {
  try {
    const registrations = await Registration.find({
      event: req.params.id
    }).populate('user', 'name email');

// promoting from waitlist to register
export const promoteFromWaitlist = async (eventId) => {

  const nextRegistration = await Registration.findOne({
    event: eventId,
    status: 'waitlisted'
  })
    .sort({ createdAt: 1 })
    .populate('user')
    .populate('event');

  if (!nextRegistration) return;

  const payload = JSON.stringify({
    userId: nextRegistration.user._id,
    eventId: nextRegistration.event._id,
    at: Date.now()
  });

  const qrCodeDataUrl =
    await generateQRCodeDataUrl(payload);

  nextRegistration.status = 'registered';
  nextRegistration.qrCodeDataUrl = qrCodeDataUrl;

  await nextRegistration.save();

  try {
    await sendEmail({
      to: nextRegistration.user.email,
      subject: `Spot Confirmed: ${nextRegistration.event.title}`,
      html: `
        <p>
          You have been promoted from the waitlist.
        </p>

        <p>
          Your registration for
          ${nextRegistration.event.title}
          is now confirmed.
        </p>
      `
    });
  } catch (_) {}
};



  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};
