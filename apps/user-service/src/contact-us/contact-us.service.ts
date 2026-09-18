import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContactUsRepository } from '@poojawala/repositories';
import { CreateContactUsDto, GetAllContactUsDto, UpdateContactUsStatusDto } from '@poojawala/dtos';
import { EmailService } from '@poojawala/email-services';
import { CONTACT_US_STATUS } from '@poojawala/entities';

@Injectable()
export class ContactUsService {
  private readonly logger = new Logger(ContactUsService.name);

  constructor(
    private readonly contactUsRepo: ContactUsRepository,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateContactUsDto) {
    const contactUs = await this.contactUsRepo.create(dto);
    return {
      success: true,
      message: 'Your message has been submitted successfully.',
      data: contactUs,
    };
  }

  async getAll(query: GetAllContactUsDto) {
    const { page, limit, search, status } = query;
    const result = await this.contactUsRepo.getAll(page, limit, search, status);

    return {
      success: true,
      message: 'Contact messages fetched successfully',
      ...result,
    };
  }

  async getById(id: number) {
    const contactUs = await this.contactUsRepo.getById(id);

    if (!contactUs) {
      throw new NotFoundException('Contact message not found');
    }

    return {
      success: true,
      message: 'Contact message fetched successfully',
      data: contactUs,
    };
  }

  async updateStatus(id: number, dto: UpdateContactUsStatusDto) {
    const contactUs = await this.contactUsRepo.getById(id);

    if (!contactUs) {
      throw new NotFoundException('Contact message not found');
    }

    if (contactUs.status === CONTACT_US_STATUS.READ && dto.status === CONTACT_US_STATUS.DRAFT) {
      throw new BadRequestException(
        'Contact message cannot be reverted back to DRAFT once marked as READ',
      );
    }

    const updated = await this.contactUsRepo.updateStatus(id, dto.status);

    if (contactUs.email) {
      try {
        await this.emailService.sendContactUsReplyEmail({
          email: contactUs.email,
          name: contactUs.name,
          status: dto.status,
          adminMessage: dto.message,
          subject: contactUs.subject,
          userOriginalMessage: contactUs.message,
        });
        this.logger.log(`Status update email sent to ${contactUs.email} for ContactUs #${id}`);
      } catch (error: any) {
        this.logger.error(
          `Failed to send contact inquiry update email to ${contactUs.email}: ${error?.message || error}`,
          error?.stack,
        );
      }
    }

    return {
      success: true,
      message: 'Contact message status updated successfully',
      data: updated,
    };
  }

  async softDelete(id: number) {
    const contactUs = await this.contactUsRepo.getById(id);

    if (!contactUs) {
      throw new NotFoundException('Contact message not found');
    }

    await this.contactUsRepo.softDelete(id);

    return {
      success: true,
      message: 'Contact message deleted successfully',
    };
  }
}
